import { useCallback, useEffect, useReducer } from 'react';
import { useSocket } from '../socket/SocketProvider.js';
import { botStreamReducer, citationsFor as lookupCitations } from './botStreamReducer.js';

/**
 * Subscribes to the Phase 8 bot events (PROJECT.md 8.6) and accumulates each
 * answer as it streams.
 *
 * The listeners are wired now so the rendering path is finished and testable
 * before the bot service exists. Nothing emits `bot:token` yet, so in practice
 * `streams` stays empty until Phase 8 lands.
 */
export function useBotStreams(roomId: string | null) {
  const socket = useSocket();
  const [streams, dispatch] = useReducer(botStreamReducer, []);

  useEffect(() => {
    dispatch({ type: 'reset' });
  }, [roomId]);

  useEffect(() => {
    if (!socket || !roomId) return;

    function onToken(p: { queryId: string; token: string }) {
      // The first token can outrun whatever told us a query started, so the
      // stream is created on demand rather than dropped.
      dispatch({ type: 'start', queryId: p.queryId, roomId: roomId! });
      dispatch({ type: 'token', queryId: p.queryId, token: p.token });
    }

    function onComplete(p: { queryId: string; messageId: string; citations: string[] }) {
      dispatch({ type: 'complete', ...p });
    }

    function onError(p: { queryId: string; message: string }) {
      dispatch({ type: 'start', queryId: p.queryId, roomId: roomId! });
      dispatch({ type: 'error', queryId: p.queryId, message: p.message });
    }

    socket.on('bot:token', onToken);
    socket.on('bot:complete', onComplete);
    socket.on('bot:error', onError);
    return () => {
      socket.off('bot:token', onToken);
      socket.off('bot:complete', onComplete);
      socket.off('bot:error', onError);
    };
  }, [socket, roomId]);

  const dismiss = useCallback((queryId: string) => dispatch({ type: 'dismiss', queryId }), []);

  const citationsFor = useCallback(
    (messageId: string) => lookupCitations(streams, messageId),
    [streams],
  );

  return { streams, dismiss, citationsFor };
}
