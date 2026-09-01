import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import { env } from '../config/env.js';

export const registry = new Registry();

// nodeId label so Prometheus can tell node-1 from node-2 when both are
// scraped - that separation is the whole point of experiment 1.
registry.setDefaultLabels({ nodeId: env.NODE_ID });

// Covers the event loop lag (nodejs_eventloop_lag_*) and V8 heap
// (nodejs_heap_size_used_bytes) series §7 asks for.
collectDefaultMetrics({ register: registry });

export const activeSockets = new Gauge({
  name: 'ws_active_sockets',
  help: 'Websocket clients currently connected to this instance',
  registers: [registry],
});

export const wsReconnectionsTotal = new Counter({
  name: 'ws_reconnections_total',
  help: 'Handshakes where the client reported it was reconnecting',
  registers: [registry],
});

export const messagesReceivedTotal = new Counter({
  name: 'chat_messages_received_total',
  help: 'message:send events accepted by this instance',
  registers: [registry],
});

export const messagesRejectedTotal = new Counter({
  name: 'chat_messages_rejected_total',
  help: 'message:send events rejected by this instance',
  labelNames: ['reason'] as const,
  registers: [registry],
});
