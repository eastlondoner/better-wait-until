# 🤖 Better Wait Until  - Chat Agent Starter Kit

![npm i agents command](./npm-agents-banner.svg)
Based on the [Chat Agent Starter Kit](https://github.com/cloudflare/agents-starter) by Cloudflare.

## What's different?

This example demonstrates how to use `better-wait-until` with Cloudflare Agents to run **long-running background tasks** while keeping your chat conversation active and responsive.

### Key Features

#### 🚀 Background Task Execution
- **Run tasks in the background**: Use the `runBackgroundTask` tool to execute long-running operations without blocking the chat interface
- **Keep chatting**: Continue your conversation with the agent while background tasks are running
- **Get notified**: The agent automatically gets notified and reacts when background tasks complete *even if you are not connected to the chat* - this enables arbitrary long-running tasks to be completed without blocking the chat interface.

#### 🔄 Enhanced Agent with Keep-Alive
This example uses `KeepAliveChatAgent` from `better-wait-until/agents` instead of the standard `AIChatAgent`. This ensures that:
- Background tasks can run for **30+ minutes** (or longer) without being terminated
- Your Durable Object stays alive while background work is processing
- WebSocket-based keep-alive mechanism maintains the DO's activity

#### 🛠️ Background Task Tool
The `runBackgroundTask` tool demonstrates how to:
- Execute tasks without blocking the main conversation thread
- Access the agent context using `getCurrentAgent()` from the AsyncLocalStorage store
- Use `ctx.waitUntil()` with better-wait-until's enhanced keep-alive mechanism
- Notify users when tasks complete via `agent.executeTask()`

### How It Works

1. **User triggers a background task**: The agent uses the `runBackgroundTask` tool
2. **Task runs in background**: The promise is passed to `ctx.waitUntil()` which is enhanced by `KeepAliveChatAgent`
3. **Keep-alive mechanism activates**: A WebSocket connection keeps the Durable Object alive
4. **User keeps chatting**: The conversation continues normally while the task processes
5. **Task completes**: The agent automatically sends a notification message when done

### Example Usage

```
User: Can you run a long data processing task in the background?
Agent: [Uses runBackgroundTask tool]
Agent: I've started the background task. I'll let you know when it's done!
User: Great! While that's running, can you help me with something else?
Agent: Of course! What would you like help with?
[... conversation continues ...]
[2-3 minutes later]
Agent: Your background task has completed successfully!
```

### Technical Implementation

The example includes:
- `KeepAliveChatAgent` - Base class that patches `ctx.waitUntil()` with keep-alive functionality
- `runBackgroundTask` tool - Demonstrates background task execution with agent context access
- WebSocket-based keep-alive - Maintains DO activity without excessive requests
- `enable_ctx_exports` compatibility flag - Required for better-wait-until to access DO namespace

### Files Modified

- `src/server.ts` - Changed to extend `KeepAliveChatAgent` instead of `AIChatAgent`
- `src/tools.ts` - Added `runBackgroundTask` to the available tools
- `src/backgroundTask.ts` - New file implementing the background task tool
- `src/utils.ts` - Updated to pass agent context to tool processing
- `wrangler.jsonc` - Added `enable_ctx_exports` compatibility flag
- `package.json` - Uses local `better-wait-until` package



## Learn More

- [`agents`](https://github.com/cloudflare/agents/blob/main/packages/agents/README.md)
- [Cloudflare Agents Documentation](https://developers.cloudflare.com/agents/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)

## License

MIT
