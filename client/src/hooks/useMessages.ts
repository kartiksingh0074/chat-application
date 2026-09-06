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
  hasMoreNewer?: boolean;
}

type Cursor = { before: string } | { after: string } | { around: string } | null;

/** How long a jumped-to message stays highlighted before fading back. */
const HIGHLIGHT_MS = 2000;

export function useMessages(roomId: string | null, currentUserId: string, token: string) {
  const socket = useSocket();
  const [messages, dispatch] = useReducer(messagesReducer, []);
  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX);
  const [hasMore, setHasMore] = useState(true);
  // Only true after a jump lands mid-history; the live tail is always the
  // newest, so there is nothing below it to fetch.
  const [hasMoreNewer, setHasMoreNewer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  // Bumped whenever the window is swapped wholesale. Virtuoso requires
  // firstItemIndex to only ever decrease, which a jump cannot honour - so the
  // list is remounted on this key instead of fighting the invariant.
  const [windowEpoch, setWindowEpoch] = useState(0);
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const pendingTimeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const highlightTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fetchPage(cursor: Cursor = null): Promise<MessagesPage> {
    const url = new URL(`${API_BASE_URL}/rooms/${roomId}/messages`);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor && 'before' in cursor) url.searchParams.set('before', cursor.before);
    if (cursor && 'after' in cursor) url.searchParams.set('after', cursor.after);
    if (cursor && 'around' in cursor) url.searchParams.set('around', cursor.around);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`failed to load messages (${res.status})`);
    return res.json();
  }

  function flagHighlight(messageId: string) {
    setHighlightId(messageId);
    if (highlightTimeout.current) clearTimeout(highlightTimeout.current);
    highlightTimeout.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
  }

  useEffect(() => {
    dispatch({ type: 'reset' });
    setFirstItemIndex(START_INDEX);
    setHasMore(true);
    setHasMoreNewer(false);
    setLoading(true);
    setScrollToId(null);
    setHighlightId(null);
    for (const timeout of pendingTimeouts.current.values()) clearTimeout(timeout);
    pendingTimeouts.current.clear();
  }, [roomId]);

  useEffect(
    () => () => {
      if (highlightTimeout.current) clearTimeout(highlightTimeout.current);
    },
    [],
  );

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
      })
      .finally(() => setLoading(false));

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

  /**
   * Scroll the list to a message, fetching the window around it first when it
   * is not loaded. Citation chips in a bot answer point at arbitrary messages,
   * which may be far outside whatever page is currently on screen.
   */
  async function jumpTo(messageId: string) {
    if (!roomId) return;

    // Already on screen: remount at that index rather than calling
    // scrollToIndex. With firstItemIndex in play the two use different
    // coordinate spaces, and initialTopMostItemIndex is unambiguously the
    // position in the data array.
    if (messages.some((m) => m.id === messageId)) {
      setScrollToId(messageId);
      setWindowEpoch((n) => n + 1);
      flagHighlight(messageId);
      return;
    }

    try {
      const page = await fetchPage({ around: messageId });
      if (page.messages.length === 0) return;
      dispatch({
        type: 'replace',
        messages: page.messages.map((m) => ({ ...m, status: 'delivered' as const })),
      });
      setFirstItemIndex(START_INDEX - page.messages.length);
      setHasMore(page.hasMore);
      setHasMoreNewer(page.hasMoreNewer ?? false);
      setWindowEpoch((n) => n + 1);
      setScrollToId(messageId);
      flagHighlight(messageId);
    } catch {
      // Leave the list where it is; the chip simply does nothing.
    }
  }

  /** Called once the list has acted on a scroll request. */
  function clearScrollTarget() {
    setScrollToId(null);
  }

  /** Return to the live tail after a jump left the list mid-history. */
  async function returnToLatest() {
    if (!roomId) return;
    try {
      const page = await fetchPage();
      dispatch({
        type: 'replace',
        messages: page.messages.map((m) => ({ ...m, status: 'delivered' as const })),
      });
      setFirstItemIndex(START_INDEX - page.messages.length);
      setHasMore(page.hasMore);
      setHasMoreNewer(false);
      setWindowEpoch((n) => n + 1);
    } catch {
      // Stay put.
    }
  }

  async function loadNewer() {
    if (loadingNewer || !hasMoreNewer || !roomId || messages.length === 0) return;
    setLoadingNewer(true);
    try {
      const newest = messages[messages.length - 1]!;
      const page = await fetchPage({ after: newest.id });
      dispatch({
        type: 'append',
        messages: page.messages.map((m) => ({ ...m, status: 'delivered' as const })),
      });
      setHasMoreNewer(page.hasMoreNewer ?? false);
    } catch {
      // leave hasMoreNewer as-is; the next scroll will retry
    } finally {
      setLoadingNewer(false);
    }
  }

  async function loadOlder() {
    if (loadingOlder || !hasMore || !roomId || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0]!;
      const page = await fetchPage({ before: oldest.id });
      dispatch({ type: 'prepend', messages: page.messages.map((m) => ({ ...m, status: 'delivered' as const })) });
      setFirstItemIndex((prev) => prev - page.messages.length);
      setHasMore(page.hasMore);
    } catch {
      // leave hasMore as-is; the next scroll-to-top will just retry
    } finally {
      setLoadingOlder(false);
    }
  }

  function sendMessage(body?: string, attachmentKey?: string) {
    const trimmed = body?.trim();
    if (!socket || !roomId) return;
    if (!trimmed && !attachmentKey) return;

    const tempId = ulid();
    dispatch({
      type: 'send',
      message: {
        id: tempId,
        tempId,
        roomId,
        senderId: currentUserId,
        body: trimmed ?? null,
        attachmentKey: attachmentKey ?? null,
        createdAt: new Date().toISOString(),
        status: 'pending',
      },
    });
    socket.emit('message:send', { roomId, tempId, body: trimmed, attachmentKey });

    const timeout = setTimeout(() => {
      pendingTimeouts.current.delete(tempId);
      dispatch({ type: 'fail', tempId });
    }, SEND_TIMEOUT_MS);
    pendingTimeouts.current.set(tempId, timeout);
  }

  /** Re-send a message that timed out, reusing its existing bubble. */
  function retryMessage(tempId: string) {
    const failed = messages.find((m) => m.tempId === tempId);
    if (!socket || !roomId || !failed) return;

    dispatch({ type: 'retry', tempId });
    socket.emit('message:send', {
      roomId,
      tempId,
      body: failed.body ?? undefined,
      attachmentKey: failed.attachmentKey ?? undefined,
    });

    const timeout = setTimeout(() => {
      pendingTimeouts.current.delete(tempId);
      dispatch({ type: 'fail', tempId });
    }, SEND_TIMEOUT_MS);
    pendingTimeouts.current.set(tempId, timeout);
  }

  return {
    messages,
    sendMessage,
    retryMessage,
    loadOlder,
    loadNewer,
    jumpTo,
    returnToLatest,
    clearScrollTarget,
    hasMore,
    hasMoreNewer,
    loading,
    loadingOlder,
    firstItemIndex,
    windowEpoch,
    scrollToId,
    highlightId,
  } as const;
}

export type { DisplayMessage };
