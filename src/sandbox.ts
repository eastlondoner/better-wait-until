import { Sandbox } from "@cloudflare/sandbox";
import { constructorUpdate } from "./index";

export abstract class KeepAliveSandbox<Env> extends Sandbox<Env> {
    constructor(ctx: DurableObjectState<{}>, readonly env: Env) {
        super(ctx, env);
        constructorUpdate(this);
    }
    
}