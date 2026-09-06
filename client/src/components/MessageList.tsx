import { useEffect, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { DisplayMessage } from '../hooks/useMessages.js';
import { Avatar } from '../ui/primitives.js';
import { Linkified } from '../ui/linkify.js';
import { useToast } from '../ui/ToastProvider.js';
import { Attachment } from './Attachment.js';

interface MessageListProps {
  messages: DisplayMessage[];
  currentUserId: string;
  nameFor: (userId: string) => string;
  firstItemIndex: number;
  loadOlder: () => void;
  onRetry: (tempId: string) => void;
  onOpenImage: (url: string) => void;
}

const dayFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

/** Consecutive messages from one sender within 5 minutes render as a group. */
function startsGroup(current: DisplayMessage, previous: DisplayMessage | undefined) {
  if (!previous) return true;
  if (previous.senderId !== current.senderId) return true;
  const gap = new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return gap > 5 * 60 * 1000;
}

export function MessageList({
  messages,
  currentUserId,
  nameFor,
  firstItemIndex,
  loadOlder,
  onRetry,
  onOpenImage,
}: MessageListProps) {
  const { notify } = useToast();
  const virtuoso = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [missed, setMissed] = useState(0);

  const lastId = messages.at(-1)?.id;
  const previous = useRef({ lastId, length: messages.length });

  // Count only messages that arrive at the end. Loading older history also
  // grows the array, but it leaves the last message alone - so comparing the
  // last id is what separates "new message" from "scrolled into the past".
  useEffect(() => {
    const before = previous.current;
    const appended = messages.length - before.length;
    if (lastId !== before.lastId && appended > 0 && !atBottom) {
      setMissed((n) => n + appended);
    }
    previous.current = { lastId, length: messages.length };
  }, [lastId, messages.length, atBottom]);

  useEffect(() => {
    if (atBottom) setMissed(0);
  }, [atBottom]);

  function jumpToBottom() {
    virtuoso.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth', align: 'end' });
  }

  async function copyMessage(body: string) {
    try {
      await navigator.clipboard.writeText(body);
      notify('Copied to clipboard', 'success');
    } catch {
      notify('Could not copy');
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Virtuoso
        ref={virtuoso}
        className="flex-1"
        data={messages}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={Math.max(0, messages.length - 1)}
        startReached={loadOlder}
        followOutput="smooth"
        atBottomStateChange={setAtBottom}
        atBottomThreshold={80}
        computeItemKey={(_, m) => m.tempId ?? m.id}
        itemContent={(index, m) => {
          const arrayIndex = index - firstItemIndex;
          const prior = arrayIndex > 0 ? messages[arrayIndex - 1] : undefined;
          const newDay = !prior || dayKey(prior.createdAt) !== dayKey(m.createdAt);
          const grouped = !newDay && !startsGroup(m, prior);
          const mine = m.senderId === currentUserId;
          const name = mine ? 'You' : nameFor(m.senderId);

          return (
            <div>
              {newDay && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="h-px flex-1 bg-border-subtle" />
                  <span className="text-xs font-medium text-content-muted">
                    {dayFormatter.format(new Date(m.createdAt))}
                  </span>
                  <span className="h-px flex-1 bg-border-subtle" />
                </div>
              )}

              <div
                className={`group relative flex gap-3 px-4 transition-colors hover:bg-surface-sunken/60
                  ${grouped ? 'py-0.5' : 'pb-0.5 pt-2'}`}
              >
                <div className="w-9 shrink-0">
                  {!grouped && <Avatar name={name === 'You' ? 'me' : name} size={36} />}
                </div>

                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-content">{name}</span>
                      <time
                        dateTime={m.createdAt}
                        className="text-xs text-content-muted"
                        title={new Date(m.createdAt).toLocaleString()}
                      >
                        {timeFormatter.format(new Date(m.createdAt))}
                      </time>
                    </div>
                  )}

                  {m.body && (
                    <p
                      className={`whitespace-pre-wrap break-words text-sm text-content
                        ${m.status === 'pending' ? 'opacity-50' : ''}`}
                    >
                      <Linkified text={m.body} />
                    </p>
                  )}

                  {m.attachmentKey && (
                    <Attachment attachmentKey={m.attachmentKey} onOpenImage={onOpenImage} />
                  )}

                  {m.status === 'failed' && (
                    <p className="mt-1 flex items-center gap-2 text-xs text-danger">
                      Failed to send
                      <button
                        onClick={() => m.tempId && onRetry(m.tempId)}
                        className="font-medium underline hover:no-underline"
                      >
                        Retry
                      </button>
                    </p>
                  )}
                </div>

                {/* Reactions, replies and threads are out of scope per PROJECT.md
                    section 1, so this stays a single action until Stage D adds
                    the jump-to-message link. */}
                {m.body && (
                  <div
                    className="absolute right-4 top-0 hidden -translate-y-1/2 rounded-lg border
                      border-border-subtle bg-surface-raised p-0.5 shadow-sm group-hover:flex
                      group-focus-within:flex"
                  >
                    <button
                      onClick={() => copyMessage(m.body!)}
                      title="Copy text"
                      aria-label="Copy message text"
                      className="rounded px-2 py-1 text-xs text-content-muted transition
                        hover:bg-surface-sunken hover:text-content
                        focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                    >
                      ⧉
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        }}
      />

      {!atBottom && (
        <button
          onClick={jumpToBottom}
          className="animate-pop-in absolute bottom-4 right-6 z-10 flex items-center gap-2 rounded-full
            border border-border-subtle bg-surface-raised py-2 pl-3 pr-3 text-xs font-medium text-content
            shadow-lg transition hover:bg-surface-sunken
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {missed > 0 && (
            <span className="rounded-full bg-brand px-1.5 py-0.5 text-brand-content tabular-nums">
              {missed > 99 ? '99+' : missed} new
            </span>
          )}
          <span aria-hidden>↓</span>
          <span className="sr-only">Jump to the newest message</span>
        </button>
      )}
    </div>
  );
}
