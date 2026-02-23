import * as logger from '../utils/logger';

type QueueStats = {
  active: number;
  pending: number;
  maxConcurrency: number;
};

const maxConcurrencyRaw = parseInt(process.env.POSTTY_PIPELINE_MAX_CONCURRENCY || '2', 10);
const maxConcurrency = Number.isFinite(maxConcurrencyRaw) && maxConcurrencyRaw > 0 ? maxConcurrencyRaw : 2;

let active = 0;
const pendingResolvers: Array<() => void> = [];

function releaseNext(): void {
  const next = pendingResolvers.shift();
  if (next) next();
}

async function waitForSlot(): Promise<void> {
  if (active < maxConcurrency) return;
  await new Promise<void>((resolve) => pendingResolvers.push(resolve));
}

export async function acquirePipelineSlot(): Promise<{
  queueWaitMs: number;
  release: () => void;
}> {
  const queuedAt = Date.now();
  await waitForSlot();
  const queueWaitMs = Date.now() - queuedAt;
  active += 1;

  return {
    queueWaitMs,
    release: () => {
      active = Math.max(0, active - 1);
      releaseNext();
    },
  };
}

export function getPipelineQueueStats(): QueueStats {
  return {
    active,
    pending: pendingResolvers.length,
    maxConcurrency,
  };
}

export function logPipelineQueueStats(prefix: string): void {
  const s = getPipelineQueueStats();
  logger.info(`${prefix} queue(active=${s.active}, pending=${s.pending}, max=${s.maxConcurrency})`);
}
