import { useEffect, useRef, useState } from 'react';
import { ulid } from 'ulidx';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, Message, ServerToClientEvents } from '@chat-application/shared';
import { createSocket } from './socket.js';

const AUTH_URL = 'http://localhost:4000/auth/login';
const ROOM_ID_STORAGE_KEY = 'chat-general-room-id';
const ROOM_NAME = 'general';

interface DisplayMessage extends Message {
  status: 'pending' | 'delivered';
  tempId?: string;
}

export function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [roomId, setRoomId] = useState<string | null>(
    () => localStorage.getItem(ROOM_ID_STORAGE_KEY),
  );
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: 'Login failed' }));
      setLoginError(body.message ?? 'Login failed');
      return;
    }
    const body = (await res.json()) as { token: string };
    setToken(body.token);
  }

  useEffect(() => {
    if (!token) return;

    const socket = createSocket(token);
    socketRef.current = socket;

    socket.on('message:new', (m) => {
      setMessages((prev) => [...prev, { ...m, status: 'delivered' }]);
    });

    socket.on('message:ack', (ack) => {
      setMessages((prev) =>
        prev.map((m) => (m.tempId === ack.tempId ? { ...m, id: ack.id, status: 'delivered' } : m)),
      );
    });

    socket.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('socket error', err);
    });

    if (roomId) {
      socket.emit('room:join', { roomId });
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, roomId]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const socket = socketRef.current;
    if (!socket || !roomId || draft.trim().length === 0) return;

    const tempId = ulid();
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        tempId,
        roomId,
        senderId: 'me',
        body: draft,
        attachmentKey: null,
        createdAt: new Date().toISOString(),
        status: 'pending',
      },
    ]);
    socket.emit('message:send', { roomId, tempId, body: draft });
    setDraft('');
  }

  if (!token) {
    return (
      <form onSubmit={handleLogin} style={{ maxWidth: 320, margin: '4rem auto', fontFamily: 'sans-serif' }}>
        <h1>Sign in</h1>
        <p style={{ color: '#666', fontSize: 14 }}>
          Use a seeded demo account (e.g. alice / bob, password: password123).
        </p>
        <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Log in</button>
        {loginError && <p style={{ color: 'red' }}>{loginError}</p>}
      </form>
    );
  }

  if (!roomId) {
    return (
      <div style={{ maxWidth: 320, margin: '4rem auto', fontFamily: 'sans-serif' }}>
        <h1>Join room</h1>
        <p style={{ color: '#666', fontSize: 14 }}>
          Enter the "{ROOM_NAME}" room ID from the seed script output.
        </p>
        <input
          placeholder="room id"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const value = (e.target as HTMLInputElement).value.trim();
              if (value) {
                localStorage.setItem(ROOM_ID_STORAGE_KEY, value);
                setRoomId(value);
              }
            }
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>{ROOM_NAME}</h1>
      <div style={{ border: '1px solid #ccc', height: 400, overflowY: 'auto', padding: 8 }}>
        {messages.map((m) => (
          <div key={m.tempId ?? m.id} style={{ opacity: m.status === 'pending' ? 0.5 : 1 }}>
            <strong>{m.senderId === 'me' ? username : m.senderId}:</strong> {m.body}
          </div>
        ))}
      </div>
      <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          style={{ flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
