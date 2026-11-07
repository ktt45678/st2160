import { expect, it } from 'vitest';

it('runs the worker entry as a module worker', async () => {
  const worker = new Worker(new URL('../src/worker/worker.ts', import.meta.url), {
    type: 'module',
  });
  try {
    const reply = await new Promise<unknown>((resolve, reject) => {
      worker.addEventListener('message', (event) => resolve(event.data));
      worker.addEventListener('error', (event) => reject(new Error(event.message)));
      worker.postMessage('ping');
    });
    expect(reply).toBe('pong');
  } finally {
    worker.terminate();
  }
});
