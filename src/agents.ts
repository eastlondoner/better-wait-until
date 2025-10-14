/// <reference types="@cloudflare/workers-types" />
import { Agent, AgentContext } from "agents";

export abstract class KeepAliveAgent<Env, State> extends Agent<Env, State> {
    constructor(ctx: AgentContext, readonly env: Env) {
        super(ctx, env);
        // Constructor update is handled by the parent module
        const constructorUpdate = (globalThis as any).__betterWaitUntilConstructorUpdate;
        if (constructorUpdate) {
            constructorUpdate(this);
        }
    }
}

