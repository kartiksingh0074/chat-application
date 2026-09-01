import { useEffect, useReducer, useRef, useState } from 'react';
import { ulid } from 'ulidx';
import type { Message } from '@chat-application/shared';
import { useSocket } from '../socket/SocketProvider.js';
import { messagesReducer, type DisplayMessage } from './messagesReducer.js';
import { API_BASE_URL } from '../config.js';

const PAGE_SIZE = 50;
const SEND_TIMEOUT_MS = 10_000;

// Virtuoso anchors prepended pages by decrementing this from a large start
// value, so scroll position is preserved however deep into history we go.
const START_INDEX = 100_000_000;

interface MessagesPage {
  messages: Message[];
  hasMore: boolean;
}

export function useMessages(roomId: string | null, currentUserId: string, token: string) {
  const socket = useSocket();
  const [messages, dispatch] = useReducer(messagesReducer, []);
  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const pendingTimeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  async function fetchPage(before?: string): Promise<MessagesPage> {
    const url = new URL(`${API_BASE_URL}/rooms/${roomId}/messages`);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (before) url.searchParams.set('before', before);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`failed to load messages (${res.status})`);
    return res.json();
  }

  useEffect(() => {
    dispatch({ type: 'reset' });
    setFirstItemIndex(START_INDEX);
    setHasMore(true);
    for (const timeout of pendingTimeouts.current.values()) clearTimeout(timeout);
    pendingTimeouts.current.clear();
  }, [roomId]);

  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit('room:join', { roomId });

    fetchPage()
      .then((page) => {
        dispatch({ type: 'prepend', messages: page.messages.map((m) => ({ ...m, status: 'delivered' as const })) });
        setFirstItemIndex(START_INDEX - page.messages.length);
        setHasMore(page.hasMore);
      })
      .catch(() => {
        // History failed to load; live messages via the socket still work.
      });

    function handleNew(m: Message) {
      if (m.roomId !== roomId) return;
      dispatch({ type: 'receive', message: m });
    }
    function handleAck(p: { tempId: string; id: string; createdAt: string }) {
      const timeout = pendingTimeouts.current.get(p.tempId);
      if (timeout) {
        clearTimeout(timeout);
        pendingTimeouts.current.delete(p.tempId);
      }
      dispatch({ type: 'ack', tempId: p.tempId, id: p.id, createdAt: p.createdAt });
    }

    socket.on('message:new', handleNew);
    socket.on('message:ack', handleAck);

    return () => {
      socket.emit('room:leave', { roomId });
      socket.off('message:new', handleNew);
      socket.off('message:ack', handleAck);
    };
  }, [socket, roomId]);

  async function loadOlder() {
    if (loadingOlder || !hasMore || !roomId || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0]!;
      const page = await fetchPage(oldest.id);
      dispatch({ type: 'prepend', messages: page.messages.map((m) => ({ ...m, status: 'delivered' as const })) });
      setFirstItemIndex((prev) => prev - page.messages.length);
      setHasMore(page.hasMore);
    } catch {
      // leave hasMore as-is; the next scroll-to-top will just retry
    } finally {
      setLoadingOlder(false);
    }
  }

  function sendMessage(body: string) {
    if (!socket || !roomId || body.trim().length === 0) return;

    const tempId = ulid();
    dispatch({
      type: 'send',
      message: {
        id: tempId,
        tempId,
        roomId,
        senderId: currentUserId,
        body,
        attachmentKey: null,
        createdAt: new Date().toISOString(),
        status: 'pending',
      },
    });
    socket.emit('message:send', { roomId, tempId, body });

    const timeout = setTimeout(() => {
      pendingTimeouts.current.delete(tempId);
      dispatch({ type: 'fail', tempId });
    }, SEND_TIMEOUT_MS);
    pendingTimeouts.current.set(tempId, timeout);
  }

  return { messages, sendMessage, loadOlder, hasMore, loadingOlder, firstItemIndex } as const;
}

export type { DisplayMessage };
