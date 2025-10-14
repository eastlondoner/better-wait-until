/// <reference types="@cloudflare/workers-types" />
import { Agent, type AgentContext } from "agents";
import { constructorUpdate } from "./index";

export abstract class KeepAliveAgent<Env, State> extends Agent<Env, State> {
    constructor(ctx: AgentContext, readonly env: Env) {
        super(ctx, env);
        constructorUpdate(this);
    }
}
