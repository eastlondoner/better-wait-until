/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import createDebug from "debug";

const logDebug = createDebug("better-wait-until");
const logError = createDebug("better-wait-until:error");

export function enableDebug(namespaces?: string): void {
    createDebug.enable(namespaces ?? "better-wait-until*");
}

export function disableDebug(): void {
    createDebug.disable();
}

let _debugInitialized = false;
function initializeDebug(env?: { DEBUG?: string; BETTER_WAIT_UNTIL_DEBUG?: string | boolean }): void {
    try {
        if (_debugInitialized) return;
        if (!env) return;
        if (env.BETTER_WAIT_UNTIL_DEBUG === true || env.BETTER_WAIT_UNTIL_DEBUG === "1") {
            createDebug.enable("better-wait-until*");
            return;
        }
        if (typeof env.DEBUG === "string" && env.DEBUG.length > 0) {
            createDebug.enable(env.DEBUG);
        }
    } finally {
        _debugInitialized = true;
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
 * @param options.fetchOptions - The fetch options to use for the no-op fetch - use this for example to add headers to help you handle the no-op fetch
 * @param options.timeout - A date after which the retries will stop. To prevent the function from running forever in cases where the provided promise never resolves
 * @returns A promise that resolves when the input promise resolves
 */
export function betterWaitUntil(durableObject: DurableObject, promise: Promise<unknown>, options: { fetchOptions?: Parameters<typeof fetch>[1]; timeout?: Date, logWarningAfter?: Date, logErrorAfter?: Date } = {}): void {
    initializeDebug(durableObject["env"]);
    const start = Date.now();
    const logWarningAt = (options.logWarningAfter?.getTime() ?? Date.now()) + 1000 * 60 * 15; // 15 minutes
    const logErrorAt = (options.logErrorAfter?.getTime() ?? Date.now()) + 1000 * 60 * 60; // 1 hour

    const ctx = (durableObject as any).ctx;
    const exportsNs = ctx?.exports;
    if (!exportsNs) {
        throw new Error("No exports on DurableObject context. You must enable exports by adding the compatibility flag \"enable_ctx_exports\" (see https://developers.cloudflare.com/workers/configuration/compatibility-flags/).");
    }
    const className: string = (durableObject as any).constructor?.name ?? "";
    const durableObjectNamespace = exportsNs[className];
    if (!durableObjectNamespace) {
        throw new Error(`No exports namespace for DurableObject class ${className}`);
    }

    let loggedWarning = false;
    let lastLoggedErrorAt = 0;

    let closureFlag = false;
    promise.finally(() => closureFlag = true);
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
                logDebug(`Background task has been running for ${Date.now() - start}ms (iteration ${count}), sending a no-op fetch to keep the agent awake`);

                const response = await durableObjectNamespace
                    .get(ctx.id)
                    .fetch("http://self/stayAwakeNoOp?count=" + count, {
                        // call options because this is the safest thing we can do to ensure we don't trigger any other logic
                        method: "OPTIONS",
                        ...options.fetchOptions,
                    });
                logDebug("no-op fetch response", { count, now: Date.now(), status: response.status });
                // consume the body so it's not left hanging but don't do anything with it
                await response.text();
                logDebug("no-op fetch successful", { count, now: Date.now() });
            } catch (err) {
                logError("Error keeping agent awake", err);
            }
        }, 60000);

        // put promises on ctx.waitUntil because sometimes in local dev things that aren't awaited and aren't in a waitUntil don't get executed.    
        ctx.waitUntil(promise.finally(() => {
            clearInterval(interval);
            logDebug("promise finally, clearing interval", { count, now: Date.now() });
        }));
    });

    // put promises on ctx.waitUntil because sometimes in local dev things that aren't awaited and aren't in a waitUntil don't get executed.
    ctx.waitUntil(intervalFinished);
}

// export under `waitUntil` for autocomplete
export { betterWaitUntil as waitUntil };
// export as default for convenience
export default betterWaitUntil;
