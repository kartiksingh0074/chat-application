import ws from 'k6/ws';
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// Realistic client behaviour: connect, join a room, then alternate between
// sending and sitting idle, the way a person in a chat actually behaves.
//
//   k6 run -e VUS=50 -e DURATION=60s k6/chat-load.js
//
// Speaks the Engine.IO v4 / Socket.IO v5 wire protocol directly:
//   "0{...}"  engine open        "40{auth}" namespace connect
//   "2"/"3"   ping/pong          "42[ev,p]" event

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket';
const ORIGIN = __ENV.ORIGIN || 'http://localhost:5173';
const ROOM_ID = __ENV.ROOM_ID;
const PASSWORD = __ENV.PASSWORD || 'password123';
const SEND_INTERVAL_MS = Number(__ENV.SEND_INTERVAL_MS || 3000);
const IDLE_JITTER_MS = Number(__ENV.IDLE_JITTER_MS || 2000);

export const options = {
  vus: Number(__ENV.VUS || 25),
  duration: __ENV.DURATION || '60s',
  thresholds: {
    // Delivery latency is the number experiment 1 cares about.
    ack_latency: ['p(95)<1000'],
  },
};

const ackLatency = new Trend('ack_latency', true);
const deliveryLatency = new Trend('delivery_latency', true);
const sendErrors = new Counter('send_errors');

export function setup() {
  if (!ROOM_ID) throw new Error('ROOM_ID env var is required');
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ username: 'alice', password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'login succeeded': (r) => r.status === 200 });
  return { token: res.json('token') };
}

export default function (data) {
  const pending = {};

  const res = ws.connect(WS_URL, { headers: { Origin: ORIGIN } }, (socket) => {
    let sendTimer = null;

    socket.on('message', (raw) => {
      // Engine.IO ping -> pong, or the connection gets reaped.
      if (raw === '2') {
        socket.send('3');
        return;
      }

      // Engine.IO OPEN: authenticate into the default namespace.
      if (raw.startsWith('0{')) {
        socket.send(`40${JSON.stringify({ token: data.token })}`);
        return;
      }

      // Namespace connected: join the room, then start the send/idle cycle.
      if (raw.startsWith('40')) {
        socket.send(`42${JSON.stringify(['room:join', { roomId: ROOM_ID }])}`);

        sendTimer = socket.setInterval(() => {
          const tempId = `k6-${__VU}-${Date.now()}`;
          pending[tempId] = Date.now();
          socket.send(
            `42${JSON.stringify([
              'message:send',
              { roomId: ROOM_ID, tempId, body: `k6 load probe from VU ${__VU}` },
            ])}`,
          );
        }, SEND_INTERVAL_MS + Math.floor(Math.random() * IDLE_JITTER_MS));
        return;
      }

      if (!raw.startsWith('42')) return;

      let frame;
      try {
        frame = JSON.parse(raw.slice(2));
      } catch (_) {
        return;
      }
      const [event, payload] = frame;

      if (event === 'message:ack') {
        const startedAt = pending[payload.tempId];
        if (startedAt) {
          ackLatency.add(Date.now() - startedAt);
          delete pending[payload.tempId];
        }
      } else if (event === 'message:new') {
        // Fan-out delivery from another VU (possibly via the other node).
        deliveryLatency.add(Date.now() - new Date(payload.createdAt).getTime());
      } else if (event === 'error') {
        sendErrors.add(1);
      }
    });

    socket.on('error', () => sendErrors.add(1));

    socket.setTimeout(() => {
      if (sendTimer) socket.clearInterval(sendTimer);
      socket.close();
    }, 30000);
  });

  check(res, { 'ws handshake status is 101': (r) => r && r.status === 101 });
}
