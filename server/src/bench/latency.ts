/**
 * Experiment 1 harness: delivery latency percentiles as connections climb.
 *
 *   npm run bench:latency -w server -- <connections> [durationSec]
 *
 * Half the connections are senders, half are listeners in the same room.
 * We measure true end-to-end delivery: the time from a sender emitting
 * message:send to a *different* client receiving message:new for it. That
 * path crosses the Redis adapter whenever the two clients landed on
 * different nodes, which is exactly what one-instance vs two changes.
 */
import { io, type Socket } from 'socket.io-client';
import { env } from '../config/env.js';

const TARGET = process.env.BENCH_TARGET ?? 'http://localhost:8080';
const ORIGIN = process.env.BENCH_ORIGIN ?? 'http://localhost:5173';
const CONNECTIONS = Number(process.argv[2] ?? 20);
const DURATION_SEC = Number(process.argv[3] ?? 20);
const SEND_INTERVAL_MS = 1000;

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function login(username: string) {
  const res = await fetch(`${TARGET}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123' }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return (await res.json()) as { token: string; user: { id: string } };
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(TARGET, {
      auth: { token },
      transports: ['websocket'],
      extraHeaders: { Origin: ORIGIN },
      reconnection: false,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

async function main() {
  const alice = await login('alice');
  const bob = await login('bob');

  const { db } = await import('../db/client.js');
  const room = await db.query.rooms.findFirst({ where: (r, { eq }) => eq(r.name, 'general') });
  if (!room) throw new Error('run `npm run seed` first');
  const roomId = room.id;

  const half = Math.max(1, Math.floor(CONNECTIONS / 2));
  const senders: Socket[] = [];
  const listeners: Socket[] = [];

  for (let i = 0; i < half; i++) senders.push(await connect(alice.token));
  for (let i = 0; i < CONNECTIONS - half; i++) listeners.push(await connect(bob.token));

  for (const s of [...senders, ...listeners]) s.emit('room:join', { roomId });
  await new Promise((r) => setTimeout(r, 500));

  const latencies: number[] = [];
  const sentAt = new Map<string, number>();
  let delivered = 0;

  for (const listener of listeners) {
    listener.on('message:new', (m: { body: string | null }) => {
      const match = m.body?.match(/bench:(\d+):(\d+)/);
      if (!match) return;
      const key = `${match[1]}:${match[2]}`;
      const t0 = sentAt.get(key);
      if (t0 !== undefined) {
        latencies.push(Date.now() - t0);
        delivered += 1;
      }
    });
  }

  let seq = 0;
  const timer = setInterval(() => {
    senders.forEach((s, idx) => {
      const key = `${idx}:${seq}`;
      sentAt.set(key, Date.now());
      s.emit('message:send', { roomId, tempId: `bench-${key}-${Date.now()}`, body: `bench:${idx}:${seq}` });
    });
    seq += 1;
  }, SEND_INTERVAL_MS);

  await new Promise((r) => setTimeout(r, DURATION_SEC * 1000));
  clearInterval(timer);
  await new Promise((r) => setTimeout(r, 1000)); // let in-flight deliveries land

  latencies.sort((a, b) => a - b);
  const result = {
    target: TARGET,
    connections: CONNECTIONS,
    senders: senders.length,
    listeners: listeners.length,
    durationSec: DURATION_SEC,
    samples: latencies.length,
    delivered,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: latencies[latencies.length - 1] ?? NaN,
  };
  console.log(JSON.stringify(result));

  for (const s of [...senders, ...listeners]) s.disconnect();
  const { pool } = await import('../db/client.js');
  await pool.end();
  process.exit(0);
}

void env; // ensure env validation runs before the harness starts
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
