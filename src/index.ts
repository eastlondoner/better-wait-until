/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { initializeDebug, logDebug, logError } from "./debug";


const WEBSOCKET_ENDPOINT = new URL("https://fake/better-wait-until/websocket");
const websocketPath = WEBSOCKET_ENDPOINT.pathname;
function getKeepAliveUrl(className: string): URL {
    return new URL(WEBSOCKET_ENDPOINT.toString() + `?className=${className}`);
}

export abstract class KeepAliveDurableObject<Env> extends DurableObject<Env> {
    constructor(readonly state: DurableObjectState, readonly env: Env) {
        super(state, env);
        constructorUpdate(this);
    }
}

export type ConstructorUpdateOptions = {
    usePartykitCompatibleMode: boolean;
}

export function constructorUpdate(instance: DurableObject<any>, options: ConstructorUpdateOptions = { usePartykitCompatibleMode: false }): void {
    const oldFetch = instance.fetch;

    const newFetch = async (request: Request): Promise<Response> => {
        const keepAliveResponse = await acceptKeepAliveWebSocket(instance["ctx"], request, options);
        if(keepAliveResponse) {
            return keepAliveResponse;
        }
        return oldFetch?.call(instance, request) ?? new Response("Not found", { status: 404 });
    }
    instance.fetch = newFetch;
    instance.constructor.prototype.fetch = newFetch;

    const oldWebSocketMessage = instance.webSocketMessage;
    const newWebSocketMessage = async (ws: WebSocket, message: string) => {
        if(message.startsWith("better-wait-until-ping ")) {
            logDebug("Server-side received:", message);
            ws.send("pong from server");
            return;
        } else {
            return await oldWebSocketMessage?.call(instance, ws, message);
        }
    }
    instance.webSocketMessage = newWebSocketMessage;
    instance.constructor.prototype.webSocketMessage = newWebSocketMessage;

    const oldWaitUntil = instance["ctx"].waitUntil;
    const newWaitUntil = (promise: Promise<unknown>) => {
        return oldWaitUntil?.call(instance["ctx"], betterAwait(instance, promise));
    }
    
    instance["ctx"].waitUntil = newWaitUntil;
}

function acceptKeepAliveWebSocket(state: DurableObjectState, request: Request, options: ConstructorUpdateOptions): Response | null {
    const url = new URL(request.url);
    if(!url.pathname.startsWith(websocketPath) || request.headers.get("Upgrade") !== "websocket") {
        return null;
    }
    try {
        const [client, server] = Object.values(new WebSocketPair());
        
        // Accept the server side with hibernation
        state.acceptWebSocket(server, ["keepalive"]);
        if(options.usePartykitCompatibleMode) {
            // Add fake attachment to the server side to keep PartyKit from freaking out
            server.serializeAttachment({
                __pk: {
                  id: -1,
                  uri: request.url
                },
                __user: null
            });
        }
        
        // Return the client side
        return new Response(null, {
        status: 101,
        webSocket: client
        });
    
    } catch (err) {
        logError("Error keeping agent awake", err);
        return new Response("Error keeping agent awake", { status: 500 });
    }
}


/**
 * Actually wait until a promise resolves.
 * Cloudflare Durable Object runtime will kill in-flight promises within about 2 minutes (if not less) after the last network request.
 * 
 * This function will keep the Durable Object alive while your promise is still running by sending a no-op fetch to it every 10 seconds.
 
 * Set a timeout to prevent the function from running forever in cases where the promise never resolves.
 * 
 * @param promise - The promise to await
 * @param options - The options for the function
 * @param options.timeout - A date after which the retries will stop. To prevent the function from running forever in cases where the provided promise never resolves
 * @returns A promise that resolves when the input promise resolves
 */
function betterAwait(durableObject: DurableObject, promise: Promise<unknown>, options: { timeout?: Date, logWarningAfter?: Date, logErrorAfter?: Date } = {}): Promise<void> {

    initializeDebug(durableObject["env"]);

    logDebug("promise received", { className: durableObject.constructor.name, options });
    const start = Date.now();
    const logWarningAt = (options.logWarningAfter?.getTime() ?? Date.now()) + 1000 * 60 * 15; // 15 minutes
    const logErrorAt = (options.logErrorAfter?.getTime() ?? Date.now()) + 1000 * 60 * 60; // 1 hour

    // access private property haha!
    const ctx = durableObject["ctx"];
    
    const exportsNs = (ctx as any).exports;
    if (!exportsNs) {
        throw new Error("No exports on DurableObject context. You must enable exports by adding the compatibility flag \"enable_ctx_exports\" (see https://developers.cloudflare.com/workers/configuration/compatibility-flags/).");
    }
    const className: string = (durableObject as any).constructor?.name ?? "";
    const durableObjectNamespace = exportsNs[className] as DurableObjectNamespace;
    if (!durableObjectNamespace) {
        throw new Error(`No exports namespace for DurableObject class ${className}`);
    }

    // Make a WebSocket connection to ourselves
    const websocketPromise = new Promise<Response>((resolve, reject) => {
        function generateWebSocketKey() {
            const randomBytes = new Uint8Array(16);
            crypto.getRandomValues(randomBytes);
            return btoa(String.fromCharCode(...randomBytes));
        }
        const response = durableObjectNamespace.get(ctx.id).fetch(getKeepAliveUrl(className), {
            headers: {
                "Upgrade": "websocket",
                "Connection": "Upgrade", 
                "Sec-WebSocket-Key": generateWebSocketKey(),
                "Sec-WebSocket-Version": "13",
            }
        }).then((response) => {
            if (response.webSocket) {
                response.webSocket.accept();
                logDebug("WebSocket accepted");
                resolve(response);
            } else {
                logError("WebSocket not accepted", response);
                throw new Error("WebSocket not accepted");
            }
        }).catch((err) => {
            logError("Error accepting WebSocket", err);
            reject(err);
        });
        return response;
    });
    // const existingAlarm = ctx.storage.getAlarm().then(async (alarm) => {
    //     if (alarm) {
    //         return alarm;
    //     }
    //     return await ctx.storage.setAlarm(new Date(Date.now() + 10 * 1000), {
    //         allowConcurrency: true,
    //         allowUnconfirmed: true,
    //     });
    // });
    // ctx.waitUntil(existingAlarm.then(() => {
    //     logDebug("alarm set", { now: Date.now() });
    // }).catch((err) => {
    //     logError("error setting alarm", err);
    // }));

    let loggedWarning = false;
    let lastLoggedErrorAt = 0;

    let closureFlag = false;
    promise.finally(() => closureFlag = true).then(() => {
        websocketPromise.then((response) => {
            response.webSocket!.close();
        });
    });
    let count = 0;
    const intervalFinished = new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
            count++;
            try {
                logDebug("checking if promise is finished", { count, now: Date.now() });
                const isPromiseFinished = !!closureFlag; // await Promise.race([promise.finally(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 1))]);
                if (isPromiseFinished) {
                    logDebug("promise is finished, clearing interval", { count, now: Date.now() });
                    clearInterval(interval);
                    resolve();
                    return;
                }
                logDebug("promise is not finished, checking for warning", { count, now: Date.now() });

                // log a warning once if the promise is still running
                if (!loggedWarning && Date.now() > logWarningAt) {
                    // do not use debug for this because we want it to surface
                    console.warn(
                        `[better-wait-until] has been running for 15 minutes, this usually indicates that you're waiting for a promise that never resolves and better-wait-until is keeping the Durable Object alive, this can incurr significant costs.`
                        + `${options.logWarningAfter ? `If this is expected, provide a logWarningAter value to betterWaitUntil to indicate when to log a warning on unresovled promises.` : ""}`
                        + `${!options.timeout ? ` You can provide a timeout value to betterWaitUntil that will stop promises from being waited on forever.` : `This promise will terminate at approximately ${options.timeout.toISOString() }`}`);
                    loggedWarning = true;
                }

                // log at error level every 10 minutes if the promise is still running
                if (Date.now() > logErrorAt && Date.now() - lastLoggedErrorAt > 1000 * 60 * 10) {
                    // do not use debug for this because we want it to surface
                    console.error(
                        `[better-wait-until] has been running for 1 hour, this usually indicates that you're waiting for a promise that never resolves and better-wait-until is keeping the Durable Object alive, this can incurr significant costs.`
                        + `${options.logErrorAfter ? `If this is expected, provide a logErrorAfter value to betterWaitUntil to indicate when to log an error on unresovled promises.` : ""}`
                        + `${!options.timeout ? ` You can provide a timeout value to betterWaitUntil that will stop promises from being waited on forever.` : `This promise will terminate at approximately ${options.timeout.toISOString() }`}`);
                    lastLoggedErrorAt = Date.now();
                }

                if(options.timeout && Date.now() > options.timeout.getTime()) {
                    // do not use debug for this because we want it to surface
                    console.error("[better-wait-until] Timeout reached, stopping keep alive interval. Your Durable Object may now be killed by Cloudflare and the promise may never resolve.");
                    clearInterval(interval);
                    resolve();
                    return;
                }

                // Cloudflare sometimes gets funky with Date.now outside of a request context so we record the iteration count as well
                logDebug(`Background task has been running for ${Date.now() - start}ms (iteration ${count})`);

                const response = await websocketPromise;
                response.webSocket!.send("better-wait-until-ping " + count);
            } catch (err) {
                logError("Error keeping agent awake", err);
            }
        }, 10000);

    });

    return intervalFinished;
}

export function betterWaitUntil(durableObject: DurableObject, promise: Promise<unknown>, options: { fetchOptions?: Parameters<typeof fetch>[1]; timeout?: Date, logWarningAfter?: Date, logErrorAfter?: Date } = {}): void {
    void betterAwait(durableObject, promise, options);
}

// export under `waitUntil` for autocomplete
export { betterWaitUntil as waitUntil };
// export as default for convenience
export default betterWaitUntil;
