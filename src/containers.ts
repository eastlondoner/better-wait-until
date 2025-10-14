/// <reference types="@cloudflare/workers-types" />
import { Container } from "@cloudflare/containers";
import { DurableObject } from "cloudflare:workers";

export abstract class KeepAliveContainer<Env> extends Container<Env> {
    constructor(ctx: DurableObject['ctx'], readonly env: Env) {
        super(ctx, env);
        // Constructor update is handled by the parent module
        const constructorUpdate = (globalThis as any).__betterWaitUntilConstructorUpdate;
        if (constructorUpdate) {
            constructorUpdate(this);
        }
    }
}

