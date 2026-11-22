import { QUEUES, workerHeartbeatKey, type PingJob } from '@appinity/shared';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { loadWorkerEnv } from './env.js';

const env = loadWorkerEnv();
// Los workers de BullMQ exigen maxRetriesPerRequest = null.
const connection = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
const heartbeatClient = new Redis(env.redisUrl, { maxRetriesPerRequest: 1 });

const workers: Worker[] = [
  new Worker<PingJob, { pong: string }>(
    QUEUES.system,
    async (job) => ({ pong: `${job.data.requestedAt} → ${new Date().toISOString()}` }),
    { connection, prefix: env.queuePrefix, concurrency: 1 },
  ),
];

for (const worker of workers) {
  worker.on('failed', (job, error) => console.error(`[${worker.name}] trabajo ${job?.id} falló: ${error.message}`));
}

async function beat(): Promise<void> {
  try {
    await heartbeatClient.set(workerHeartbeatKey(env.queuePrefix), String(Date.now()), 'EX', 60);
  } catch (error) {
    console.error(`No se pudo escribir el latido: ${(error as Error).message}`);
  }
}
await beat();
const heartbeat = setInterval(beat, 10_000);

console.log(`Worker escuchando colas [${workers.map((w) => w.name).join(', ')}] con prefijo ${env.queuePrefix}`);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: cerrando worker…`);
  clearInterval(heartbeat);
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled([connection.quit(), heartbeatClient.quit()]);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
