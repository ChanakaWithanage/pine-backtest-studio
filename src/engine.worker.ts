/// <reference lib="webworker" />
import { runBacktest } from './lib/backtest';
import type { WorkerRequest, WorkerResponse } from './types';

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, code, candles, contract } = event.data;
  try {
    const results = await runBacktest(code, candles, contract);
    const message: WorkerResponse = { id, type: 'success', results };
    self.postMessage(message);
  } catch (error) {
    const message: WorkerResponse = {
      id, type: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
    self.postMessage(message);
  }
};
