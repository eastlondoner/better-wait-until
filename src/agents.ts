/// <reference types="@cloudflare/workers-types" />
import { Agent, Connection, ConnectionContext, type AgentContext } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import { constructorUpdate } from "./index";
import type{ env } from "cloudflare:workers";
import { logDebug, logError } from "./debug";

export { enableDebug, disableDebug } from "./debug";

function agentsConstructorUpdate(instance: Agent<any, any>): void {
    const oldBroadcast = instance.broadcast;
    const newBroadcast = (msg: string, without: string[] | undefined) => {
        without = without ?? [];
        for (const connection of instance.getConnections()) {
            if (connection.url?.includes("better-wait-until/websocket")) {
                logDebug("Skipping keep-alive connection", connection);
                without.push(connection.id);
            }
        }
        return oldBroadcast.call(instance, msg, without);
    }
    instance.broadcast = newBroadcast;
    instance.constructor.prototype.broadcast = newBroadcast;
}

export abstract class KeepAliveAgent<
        Env = typeof env,
        State = unknown,
        Props extends Record<string, unknown> = Record<string, unknown>
    > extends Agent<Env, State, Props> {
    constructor(ctx: AgentContext, readonly env: Env) {
        super(ctx, env);
        constructorUpdate(this, { usePartykitCompatibleMode: true });
        agentsConstructorUpdate(this);
    }

    onConnect(connection: Connection, ctx: ConnectionContext) {
        if(connection.url?.includes("better-wait-until/websocket")) {
            logDebug("Skipping keep-alive connection");
            return;
        }
        super.onConnect(connection, ctx);
    }
}

export abstract class KeepAliveChatAgent<Env = unknown, State = unknown> extends AIChatAgent<Env, State> {
    constructor(ctx: AgentContext, readonly env: Env) {
        super(ctx, env);
        constructorUpdate(this, { usePartykitCompatibleMode: true });
        agentsConstructorUpdate(this);
    }

    onConnect(connection: Connection, ctx: ConnectionContext) {
        if(connection.url?.includes("better-wait-until/websocket")) {
            logDebug("On connect skip keep-alive connection");
            return;
        }
        super.onConnect(connection, ctx);
    }
}
