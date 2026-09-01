/**
 * Samples event loop lag + heap straight from Prometheus while a load run
 * is in flight. Used by experiment 2 (sync write vs BullMQ).
 *
 *   npm run bench:lag -w server -- <durationSec> <label>
 */
const PROM = process.env.PROM_URL ?? 'http://localhost:9090';
const DURATION_SEC = Number(process.argv[2] ?? 30);
const LABEL = process.argv[3] ?? 'run';
const INTERVAL_MS = 1000;

async function instantQuery(query: string): Promise<{ nodeId: string; value: number }[]> {
  const res = await fetch(`${PROM}/api/v1/query?query=${encodeURIComponent(query)}`);
  const body = (await res.json()) as {
    data: { result: { metric: Record<string, string>; value: [number, string] }[] };
  };
  return body.data.result.map((r) => ({ nodeId: r.metric.nodeId ?? '?', value: Number(r.value[1]) }));
}

function stats(values: number[]) {
  if (values.length === 0) return { mean: NaN, p95: NaN, max: NaN };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))]!,
    max: sorted[sorted.length - 1]!,
  };
}

async function main() {
  const lagSamples: number[] = [];
  const heapSamples: number[] = [];
  const deadline = Date.now() + DURATION_SEC * 1000;

  while (Date.now() < deadline) {
    const [lag, heap] = await Promise.all([
      instantQuery('nodejs_eventloop_lag_p99_seconds'),
      instantQuery('nodejs_heap_size_used_bytes'),
    ]);
    for (const s of lag) lagSamples.push(s.value * 1000); // -> ms
    for (const s of heap) heapSamples.push(s.value / 1024 / 1024); // -> MB
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  const lag = stats(lagSamples);
  const heap = stats(heapSamples);
  console.log(
    JSON.stringify({
      label: LABEL,
      durationSec: DURATION_SEC,
      samples: lagSamples.length,
      eventLoopLagMs: { mean: +lag.mean.toFixed(2), p95: +lag.p95.toFixed(2), max: +lag.max.toFixed(2) },
      heapUsedMb: { mean: +heap.mean.toFixed(1), p95: +heap.p95.toFixed(1), max: +heap.max.toFixed(1) },
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
