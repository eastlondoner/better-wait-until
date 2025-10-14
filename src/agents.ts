/// <reference types="@cloudflare/workers-types" />
import { Agent, AgentContext } from "agents";
import { DurableObject } from "cloudflare:workers";

export abstract class KeepAliveAgent<Env> extends Agent<Env> {
    constructor(ctx: AgentContext, readonly env: Env) {
        super(ctx, env);
        // Constructor update is handled by the parent module
        const constructorUpdate = (globalThis as any).__betterWaitUntilConstructorUpdate;
        if (constructorUpdate) {
            constructorUpdate(this);
        }
    }
}

