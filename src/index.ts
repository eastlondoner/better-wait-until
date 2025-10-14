/**
 * Wait until a promise resolves.
 * 
 * @param promise - The promise to await
 * @returns A promise that resolves when the input promise resolves
 */
export async function waitUntil(promise: Promise<unknown>): Promise<void> {
  await promise;
}


const interval = setInterval(async () => {
    try {
      // @ts-expect-error
      const response = await this.ctx.exports[this.constructor.name]
        .get(this.ctx.id)
        .fetch("http://self/stayAwakeNoOp");
      // consume the body so it's not left hanging
      await response.text();
      console.log(
        `Background task has been running for ${Date.now() - start}ms, sending a no-op fetch to keep the agent awake`,
      );
    } catch (err) {
      console.error("Error keeping agent awake", err);
    }
  }, 10000);
  this.ctx.waitUntil(
    fn().finally(() => {
      clearInterval(interval);
    }),
  );
},