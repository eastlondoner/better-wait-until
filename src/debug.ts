import createDebug from "debug";

export const logDebug = createDebug("better-wait-until");
export const logError = createDebug("better-wait-until:error");

export function enableDebug(namespaces?: string): void {
    createDebug.enable(namespaces ?? "better-wait-until*");
}

export function disableDebug(): void {
    createDebug.disable();
}

let _debugInitialized = false;
export function initializeDebug(env?: { DEBUG?: string; BETTER_WAIT_UNTIL_DEBUG?: string | boolean }): void {
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
