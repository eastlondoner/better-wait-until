// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { waitUntil } from "better-wait-until";
import htmlPage from "./index.html";

type TaskType = "better-wait-until" | "builtin-wait-until";

export interface Env {
    BACKGROUND_TASK: DurableObjectNamespace<BackgroundTaskDO>;
    BUILTIN_TASK: DurableObjectNamespace<BuiltinWaitUntilDO>;
    DB: D1Database;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === "/") {
            return new Response(htmlPage, { headers: { "content-type": "text/html; charset=utf-8" } });
        }

        if (url.pathname === "/start") {
            const id = env.BACKGROUND_TASK.idFromName("demo");
            const stub = env.BACKGROUND_TASK.get(id);
            return stub.fetch(request);
        }

        if (url.pathname === "/startbuiltin") {
            const id = env.BUILTIN_TASK.idFromName("demo");
            const stub = env.BUILTIN_TASK.get(id);
            return stub.fetch(request);
        }

        if (url.pathname === "/status") {
            // Read status from D1 so polling does not wake the DO
            const { results } = await env.DB.prepare(
                "SELECT id, task_type, start_time_ms, end_time_ms, scheduled_duration_ms, elapsed_ms FROM tasks ORDER BY created_at DESC LIMIT 20"
            ).all();

            const tasks = results || [];
            const latestByType: Record<TaskType, any | null> = {
                "better-wait-until": null,
                "builtin-wait-until": null,
            };

            for (const row of tasks) {
                const type = row.task_type as TaskType;
                if (type in latestByType && !latestByType[type]) {
                    latestByType[type] = row;
                }
            }

            return new Response(JSON.stringify({ latestByType, recentTasks: tasks }), {
                headers: { "content-type": "application/json" },
            });
        }

        return new Response("Not found", { status: 404 });
    },
};

async function createTask(env: Env, taskType: TaskType, id: string, startTime: number, durationMs: number): Promise<void> {
    await env.DB.prepare(
        "INSERT OR REPLACE INTO tasks (id, task_type, start_time_ms, scheduled_duration_ms) VALUES (?, ?, ?, ?)"
    )
        .bind(id, taskType, startTime, durationMs)
        .run();
}

async function completeTask(env: Env, id: string, endTime: number): Promise<void> {
    const elapsed = endTime - Number((await env.DB.prepare("SELECT start_time_ms FROM tasks WHERE id = ?").bind(id).first<{ start_time_ms: number }>("start_time_ms")) ?? 0);
    await env.DB.prepare(
        "UPDATE tasks SET end_time_ms = ?, elapsed_ms = ? WHERE id = ?"
    )
        .bind(endTime, elapsed, id)
        .run();
}

export class BackgroundTaskDO extends DurableObject {
    constructor(readonly state: DurableObjectState, readonly env: Env) {
        super(state, env);
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === "/stayAwakeNoOp") {
            return new Response(null, { status: 204 });
        }

        if (url.pathname === "/start") {
            const startTime = Date.now();
            const durationMs = Number(url.searchParams.get("durationMs") ?? 0);
            if (!Number.isFinite(durationMs) || durationMs < 0) {
                return new Response("Invalid durationMs", { status: 400 });
            }

            // generate a stable id for this run (e.g., timestamp-based)
            const id = `${this.state.id.toString()}-${startTime}`;

            await createTask(this.env, "better-wait-until", id, startTime, durationMs);

            const taskPromise = new Promise<void>((resolve) => setTimeout(resolve, durationMs)).then(async () => {
                const endTime = Date.now();
                await completeTask(this.env, id, endTime);
                console.log("taskPromise resolved (better-wait-until)", { id, endTime });
            });

            waitUntil(this, taskPromise);
            return new Response(JSON.stringify({ status: "started", durationMs }), {
                status: 202,
                headers: { "content-type": "application/json" },
            });
        }

        if (url.pathname === "/status") {
            // Keep for backward compatibility if someone calls DO directly
            const { results } = await this.env.DB.prepare(
                "SELECT id, task_type, start_time_ms, end_time_ms, scheduled_duration_ms, elapsed_ms FROM tasks ORDER BY created_at DESC LIMIT 1"
            ).all();
            const lastTask = (results && results.length > 0) ? results[0] : null;
            return new Response(JSON.stringify({ lastTask }), {
                headers: { "content-type": "application/json" },
            });
        }

        return new Response("Not found", { status: 404 });
    }
}

export class BuiltinWaitUntilDO extends DurableObject {
    constructor(readonly state: DurableObjectState, readonly env: Env) {
        super(state, env);
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === "/startbuiltin") {
            const startTime = Date.now();
            const durationMs = Number(url.searchParams.get("durationMs") ?? 0);
            if (!Number.isFinite(durationMs) || durationMs < 0) {
                return new Response("Invalid durationMs", { status: 400 });
            }

            const id = `${this.state.id.toString()}-${startTime}`;
            await createTask(this.env, "builtin-wait-until", id, startTime, durationMs);

            const taskPromise = new Promise<void>((resolve) => setTimeout(resolve, durationMs)).then(async () => {
                const endTime = Date.now();
                await completeTask(this.env, id, endTime);
                console.log("taskPromise resolved (builtin-wait-until)", { id, endTime });
            });

            this.ctx.waitUntil(taskPromise);

            return new Response(JSON.stringify({ status: "started", durationMs }), {
                status: 202,
                headers: { "content-type": "application/json" },
            });
        }

        return new Response("Not found", { status: 404 });
    }
}