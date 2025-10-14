/// <reference types="@cloudflare/workers-types" />
import { Container } from "@cloudflare/containers";
import type { DurableObject } from "cloudflare:workers";
import { constructorUpdate } from "./index";

export abstract class KeepAliveContainer<Env> extends Container<Env> {
    constructor(ctx: DurableObject['ctx'], readonly env: Env) {
        super(ctx, env);
        constructorUpdate(this);
    }
}
