/** Owns worker message/error lifecycle; stop is cooperative, dispose is immediate. */
export class TrainingWorkerClient {
  constructor(worker, { onMessage = () => {}, onError = () => {} } = {}) {
    if (!worker?.postMessage || !worker?.terminate) throw new TypeError('A Worker-like instance is required.');
    this.worker = worker; this.onMessage = onMessage; this.onError = onError; this.terminated = false;
    worker.onmessage = ({ data }) => {
      if (this.terminated) return;
      try { this.onMessage(data); }
      finally { if (data?.type === 'complete' || data?.type === 'error') this.terminate(); }
    };
    worker.onerror = (event) => { if (this.terminated) return; try { this.onError(event); } finally { this.terminate(); } };
  }
  send(message) { if (!this.terminated) this.worker.postMessage(message); }
  requestStop() { this.send({ type: 'stop' }); }
  terminate() { if (this.terminated) return; this.terminated = true; this.worker.onmessage = null; this.worker.onerror = null; this.worker.terminate(); }
  dispose() { this.terminate(); }
}
