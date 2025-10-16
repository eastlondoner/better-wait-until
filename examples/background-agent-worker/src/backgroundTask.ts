import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";
import { setTimeout } from "node:timers/promises";
import type { Chat } from "./server";
import { getCurrentAgent } from "agents";

export const runBackgroundTask = tool({
    description: "run a task in the background. This will not block the main conversation thread. You will be notified when the task is complete.",
    inputSchema: z.object({ task: z.string() }),
    execute: async ({ task }) => {
      try{
        // we can now read the agent context from the ALS store
        const { agent } = getCurrentAgent<Chat>();
  
        if(!agent) {
          throw new Error("Agent not found");
        }
  
        console.log(`Running background task: ${task}`);
        const backgroundTask = async () => {
          console.log(`sleeping for 160 seconds to simulate a long-running task`);
          await setTimeout(160_000);
          console.log(`actually the background task: ${task}`);
          await agent.executeTask(task, task);
        }
  
        // accessing private property haha!
        agent["ctx"].waitUntil(backgroundTask());
  
  
        return `Background task ${task} has been successfully started.`;
      } catch (error) {
        console.error("Error executing background task", error);
        return `Error executing background task: ${error}`;
      }
    }
  });
