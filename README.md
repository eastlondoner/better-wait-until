# better-wait-until

A utility for Cloudflare Workers Durable Objects that ensures long-running background tasks *actually* complete when you use `ctx.waitUntil`.

**Why?** Because Durable Objects gracelessly terminate background promises after 70-140s.

**Really** Yes really! When I say gracelessly I mean it, `finally` blocks are not called, your code is just evicted from CPU and memory. If you're lucky you see "IoContext timed out due to inactivity, waitUntil tasks were cancelled without completing." in the logs but you probably won't.

**What about when the Durable Object wakes up?** Nothing special, whatever was partially executed is gone.

**YES, I know about waitUntil!** this is what happens, even if you're using it.

This library allows you to keep your Durable Object alive significantly longer (more than 30 minutes). Switching is very easy, use the better-wait-until classes as drop in replacements for `DurableObject`, `Sandbox`, `Container`, `Agent` or `AIChatAgent` and `ctx.waitUntil` is patched automatically for you. If you want to get going then read the TLDR section but I recommend you read all the way through to find out why it might not be a good idea to actually do this.

## TLDR;

Install the package:

```bash
npm install --save better-wait-until
```

You **must** enable the `enable_ctx_exports` compatibility flag in your `wrangler.jsonc`:

```jsonc
{
  "compatibility_flags": [
    "enable_ctx_exports"
  ]
}
```

Replace `extends DurableObject` / `extends Agent` / `extends Container` / `extends Sandbox` in your class declaration with the corresponding "KeepAlive" class from `better-wait-until` / `better-wait-until/containers` / `better-wait-until/agents` / `better-wait-until/sandbox`:

```typescript
import { KeepAliveDurableObject } from "better-wait-until";
// or import { KeepAliveContainer } from "better-wait-until/containers";
// or import { KeepAliveAgent } from "better-wait-until/agents";
// or import { KeepAliveSandbox } from "better-wait-until/sandbox";

export class MyDurableObject extends KeepAliveDurableObject<Env> {
// export class MyAgent extends KeepAliveAgent<Env> {
// export class MyContainer extends KeepAliveContainer<Env> {
// export class MySandbox extends KeepAliveSandbox<Env>

  async fetch(request: Request): Promise<Response> {
    const backgroundTask = this.longRunningTask(); // no await so returns a Promise
    this.ctx.waitUntil(backgroundTask); // returns void - non-blocking call to keep DO alive and running until backgroundTask promise resolves
    return new Response("Task started", { status: 202 }); // immediate return to the caller, closing the network connection
  }
}
```

## The Problem

Cloudflare Durable Objects have a critical limitation: **promises passed to `ctx.waitUntil()` can be terminated 70-140s (or less) after the last incoming network request (or RPC) has finished**. This means if you have background tasks that take longer than 2 minutes to complete, they may be killed before finishing, even when using the built-in `waitUntil()` method.

This is problematic for use cases like:
- Background AI agents espescially multi-turn agents with tool calls
- Long-running data processing tasks
- Batch operations that take several minutes
- Background jobs that involve multiple API calls or database operations
- Any asynchronous work that can't be completed within the 2-minute window

The Cloudflare runtime assumes that after network activity stops, the Durable Object is idle and can be safely terminated, which doesn't account for legitimate long-running background work.

Trying to run non-resumable arbitrarily long running promises in Durable Objects is not a good idea. Cloudflare may well still terminate your Durable Object either because you're trying to deploy a new one or for their own internal reasons

## The Solution

Split your background tasks into smaller, resumable chunks that can be completed within the 70s window.
Make use of Durable Object State, Workflows, Queues, or perhaps even Containers.

## The Hack

If you don't want to do that, or can't, you can use `better-wait-until` to keep your Durable Object alive indefinitely [1] while your promise is running.

1: Indefinitely until you deploy a new version of the DO or Cloudflare moves your stuff or you hit the CPU timeout or another limit. 

`better-wait-until` solves this by **keeping your Durable Object alive and in memory** while your promise is running. It does this by:

1. Establishing a WebSocket connection to the Durable Object itself
2. Monitoring your promise to see if it's still running
3. Every 10 seconds, sending a ping message over the WebSocket
4. This periodic WebSocket activity signals to Cloudflare that the DO is still active
5. Once your promise completes, the WebSocket is closed and the keep-alive mechanism stops

## Why WebSockets?

The WebSocket-based approach:

- ✅ Establishes a single persistent connection per promise being waited on
- ✅ Sends lightweight ping messages from the DO, to the same DO, every 10 seconds
- ✅ Significantly reduces request count and associated costs
- ✅ More reliable for very long-running tasks
- ✅ No "Subrequest deply limit exceeded" errors

## Installation

```bash
npm install better-wait-until
```

## Configuration

You **must** enable the `enable_ctx_exports` compatibility flag in your `wrangler.jsonc`:

```jsonc
{
  "compatibility_flags": [
    "enable_ctx_exports"
  ]
}
```

This flag allows `better-wait-until` to access the Durable Object namespace and send keep-alive requests.

## Usage

### Using the Base Class

The easiest way to use `better-wait-until` is to extend the `KeepAliveDurableObject` base class, which automatically patches `ctx.waitUntil` to use the keep-alive mechanism:

```typescript
import { KeepAliveDurableObject } from "better-wait-until";

export class MyDurableObject extends KeepAliveDurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    // Start a long-running background task
    const backgroundTask = this.longRunningTask();
    
    // Use ctx.waitUntil as normal - it's automatically enhanced!
    this.ctx.waitUntil(backgroundTask);
    
    return new Response("Task started", { status: 202 });
  }

  async longRunningTask() {
    // This can take as long as needed
    await someExpensiveOperation();
    await anotherSlowProcess();
    // Task will complete even if it takes hours
  }
}
```

### Advanced Example - Using the `waitUntil` Function

`better-wait-until` supports additional configuration options. To use them you must import waitUntil from `better-wait-until` rather than using the `ctx.waitUntil` method directly.

You must use the KeepAlive prefixed classes from `better-wait-until` with the `waitUntil` function. If you do not you will not get the behaviour you want.

The additional configuration options are:
- `timeout`: A Date after which keep-alive pings will stop
- `logWarningAfter`: A Date after which to log warnings about long-running promises
- `logErrorAfter`: A Date after which to log errors about long-running promises

```typescript
import { waitUntil } from "better-wait-until";

const ONE_MINUTE = 1000 * 60;
const ONE_HOUR = 1000 * 60 * 60;

export class MyDurableObject extends KeepAliveDurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const backgroundTask = this.longRunningTask();
    waitUntil(this, backgroundTask, {
       // log a warning if the promise takes more that 30 minutes to resolve
      logWarningAfter: new Date(Date.now() + 30 * ONE_MINUTE),

      // log an error if the promise takes more that 1 hour to resolve
      logErrorAfter: new Date(Date.now() + ONE_HOUR),

      // stop keep-alive pings after 2 hours
      timeout: new Date(Date.now() + 2 * ONE_HOUR)
    });

    return new Response("Task started", { status: 202 });
  });
});
```

### Debug Logging

Enable debug logging to see what's happening:

```typescript
import { enableDebug } from "better-wait-until";

// Enable debug logs
enableDebug("better-wait-until*");

// Or set the DEBUG environment variable
// DEBUG=better-wait-until*
```

You can also enable debugging via environment variables in your `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "DEBUG": "better-wait-until*"
  }
}
```

Or use the `BETTER_WAIT_UNTIL_DEBUG` environment variable:

```jsonc
{
  "vars": {
    "BETTER_WAIT_UNTIL_DEBUG": true
  }
}
```

## Safety Features

### Automatic Warnings

- **15-minute warning**: If a promise runs for more than 15 minutes, a warning is logged to help identify potentially stuck promises
- **1-hour error logs**: After 1 hour, errors are logged every 10 minutes to alert you to unexpectedly long-running tasks

These warnings help you identify issues early and prevent unexpected costs from Durable Objects that stay alive longer than intended.

### Timeout Protection

Set a `timeout` option to automatically stop the keep-alive mechanism after a certain time:

```typescript
waitUntil(this, promise, {
  timeout: new Date(Date.now() + 1000 * 60 * 60) // 1 hour maximum
});
```

This prevents promises that never resolve from keeping your Durable Object alive indefinitely.

## How It Works

Internally, `better-wait-until`:

1. Extracts the Durable Object class name and gets its namespace from `ctx.exports`
2. Establishes a WebSocket connection to the DO at a special endpoint (`/better-wait-until/websocket`)
3. The WebSocket uses hibernation API for efficiency
4. Sets up a 10-second interval timer
5. On each tick, checks if your promise has completed
6. If not complete, sends a ping message over the WebSocket connection
7. This WebSocket activity counts as network activity, keeping the DO alive
8. Once the promise completes, the WebSocket is closed and the interval is cleared automatically

This approach avoids the "too many requests" problem that occurred with the fetch-based approach, while still maintaining network activity to keep the Durable Object alive.

## Example: Comparison Demo

The `examples/background-task-worker` directory contains a full working example that demonstrates the difference between `better-wait-until` and the built-in `waitUntil()`. 

To run it:

```bash
cd examples/background-task-worker
npm install
npm run dev
```

Open the URL shown in your terminal to see a side-by-side comparison of:
- Tasks using `better-wait-until` (complete successfully)
- Tasks using built-in `ctx.waitUntil()` (may fail for long-running tasks)

## When to Use This

Use `better-wait-until` when:
- Your background tasks take longer than 2 minutes
- You have batch processing or data migration work
- You're doing complex multi-step operations in the background
- You need guaranteed completion of async work after responding to requests

**Don't use this** for:
- Short tasks (< 2 minutes) - use regular `ctx.waitUntil()`
- Synchronous work that completes before the response is sent
- Operations that must complete within seconds

## Cost Considerations

The keep-alive mechanism uses WebSocket messages rather than HTTP requests, which is more efficient:

- **Initial WebSocket connection**: 1 request to establish the connection
- **Keep-alive pings**: WebSocket messages sent every 10 seconds (these don't count as separate requests)
- **Overall cost**: For a task running 10 minutes, this results in just 1 WebSocket request instead of 10+ HTTP requests

This WebSocket-based approach significantly reduces costs compared to a fetch-based keep-alive mechanism. However, long-running tasks will still incur Durable Object compute time costs.

The warning logs at 15 minutes and 1 hour help you identify cases where tasks are running longer than expected, which could lead to unexpected costs.

## API Reference

### `KeepAliveDurableObject<Env>`

A base class for Durable Objects that automatically enhances `ctx.waitUntil()` with keep-alive functionality.

**Usage:**
```typescript
export class MyDurableObject extends KeepAliveDurableObject<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }
  // ... your methods
}
```

When you extend this class:
- `ctx.waitUntil()` is automatically patched to use the WebSocket keep-alive mechanism
- WebSocket requests to `/better-wait-until/websocket` are handled automatically
- WebSocket ping messages are handled automatically
- No additional configuration needed!

### `waitUntil(durableObject, promise, options?)`

Alias: `betterWaitUntil`

Manually apply keep-alive functionality to a promise. Use this if you can't extend `KeepAliveDurableObject`.

**Parameters:**
- `durableObject` (DurableObject): The Durable Object instance (`this` in your DO class)
- `promise` (Promise<unknown>): The promise to keep alive
- `options` (optional):
  - `timeout`: A Date after which keep-alive pings will stop
  - `logWarningAfter`: A Date after which to log warnings about long-running promises
  - `logErrorAfter`: A Date after which to log errors about long-running promises

**Returns:** `void`

### `enableDebug(namespaces?)`

Enable debug logging.

**Parameters:**
- `namespaces` (optional string): Debug namespace pattern (default: `"better-wait-until*"`)

### `disableDebug()`

Disable debug logging.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
