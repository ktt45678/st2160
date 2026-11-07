// Own module so hosts can load it with `new URL('./worker/worker.js', import.meta.url)`.

/** Core compiles with the DOM lib, so declare the worker scope members used here. */
interface WorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

const scope = globalThis as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  if (event.data === 'ping') scope.postMessage('pong');
});
