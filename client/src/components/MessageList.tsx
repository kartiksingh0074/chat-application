import { useEffect, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { DisplayMessage } from '../hooks/useMessages.js';
import { Avatar } from '../ui/primitives.js';
import { Linkified } from '../ui/linkify.js';
import { useToast } from '../ui/ToastProvider.js';
import { ArrowDownIcon, CopyIcon, SparkleIcon } from '../ui/icons.js';
import { Attachment } from './Attachment.js';
import { CitationChips } from './BotAnswer.js';

interface MessageListProps {
  messages: DisplayMessage[];
  currentUserId: string;
  nameFor: (userId: string) => string;
  avatarFor: (userId: string) => string | null;
  onOpenProfile: (userId: string, anchor: DOMRect) => void;
  firstItemIndex: number;
  loadOlder: () => void;
  loadNewer: () => void;
  hasMoreNewer: boolean;
  onReturnToLatest: () => void;
  /** Remount key: bumped when the loaded window is swapped by a jump. */
  windowEpoch: number;
  /** Message to open at, in the current window. */
  scrollToId: string | null;
  /** Message to flash after a jump. */
  highlightId: string | null;
  onJumpTo: (messageId: string) => void;
  botUserId?: string | null;
  citationsFor: (messageId: string) => string[];
  onRetry: (tempId: string) => void;
  onOpenImage: (url: string) => void;
}

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
// 'numeric', not '2-digit': "4:02 PM" rather than "04:02 PM".
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

// Defined once, outside the component: an inline object here would hand
// Virtuoso a new Footer type on every render and remount it each time.
const LIST_COMPONENTS = { Footer: () => <div className="h-3" /> };

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
  avatarFor,
  onOpenProfile,
  firstItemIndex,
  loadOlder,
  loadNewer,
  hasMoreNewer,
  onReturnToLatest,
  windowEpoch,
  scrollToId,
  highlightId,
  onJumpTo,
  botUserId,
  citationsFor,
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

  // After a jump the newest message is no longer loaded, so "go to the
  // bottom" has to refetch the live tail rather than scroll within the window.
  function jumpToBottom() {
    if (hasMoreNewer) {
      onReturnToLatest();
      return;
    }
    virtuoso.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth', align: 'end' });
  }

  const openAt = scrollToId ? messages.findIndex((m) => m.id === scrollToId) : -1;

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
        key={windowEpoch}
        ref={virtuoso}
        className="flex-1"
        data={messages}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={
          openAt >= 0 ? { index: openAt, align: 'center' } : Math.max(0, messages.length - 1)
        }
        startReached={loadOlder}
        endReached={hasMoreNewer ? loadNewer : undefined}
        // Following the tail is only correct while the tail is loaded. Mid
        // history a new message must not yank the reader away from the
        // citation they just jumped to.
        followOutput={hasMoreNewer ? false : 'smooth'}
        atBottomStateChange={setAtBottom}
        atBottomThreshold={80}
        computeItemKey={(_, m) => m.tempId ?? m.id}
        components={LIST_COMPONENTS}
        itemContent={(index, m) => {
          const arrayIndex = index - firstItemIndex;
          const prior = arrayIndex > 0 ? messages[arrayIndex - 1] : undefined;
          const newDay = !prior || dayKey(prior.createdAt) !== dayKey(m.createdAt);
          const grouped = !newDay && !startsGroup(m, prior);
          const mine = m.senderId === currentUserId;
          const isBot = botUserId != null && m.senderId === botUserId;
          const name = isBot ? 'Bot' : mine ? 'You' : nameFor(m.senderId);
          // Saved citations come with the message; the in-memory lookup only
          // covers the moment between a stream finishing and the save landing.
          const citations = isBot ? (m.citations?.length ? m.citations : citationsFor(m.id)) : [];
          const highlighted = m.id === highlightId;
          const time = timeFormatter.format(new Date(m.createdAt));

          return (
            <div>
              {newDay && (
                <div className="flex items-center gap-3 px-4 pb-1 pt-5">
                  <span className="h-px flex-1 bg-border-subtle" />
                  <span className="text-[11px] font-semibold text-content-muted">
                    {dayFormatter.format(new Date(m.createdAt))}
                  </span>
                  <span className="h-px flex-1 bg-border-subtle" />
                </div>
              )}

              <div
                className={`group relative flex gap-3.5 px-4 transition-colors
                  ${grouped ? 'py-px' : 'pb-px pt-3.5'}
                  ${highlighted ? 'bg-warning/15' : 'hover:bg-content/[0.035]'}`}
              >
                <div className="w-10 shrink-0">
                  {grouped ? (
                    // Grouped lines have no header, so their time appears on hover.
                    <time
                      dateTime={m.createdAt}
                      className="invisible block pt-[3px] text-right text-[10.5px] leading-5 text-content-muted
                        tabular-nums group-hover:visible"
                    >
                      {time}
                    </time>
                  ) : isBot ? (
                    <span
                      aria-hidden
                      className="flex size-10 items-center justify-center rounded-full bg-brand text-[20px] text-brand-content"
                    >
                      <SparkleIcon />
                    </span>
                  ) : (
                    <button
                      onClick={(e) => onOpenProfile(m.senderId, e.currentTarget.getBoundingClientRect())}
                      aria-label={`View ${name === 'You' ? 'your' : `${name}'s`} profile`}
                      className="mt-0.5 rounded-full transition hover:opacity-85 focus-visible:outline-2
                        focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <Avatar name={name === 'You' ? 'me' : name} size={40} avatarKey={avatarFor(m.senderId)} />
                    </button>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <div className="flex items-baseline gap-2">
                      {isBot ? (
                        <span className="flex items-center gap-1.5 text-[15px] font-semibold text-brand">
                          Bot
                          <span className="rounded bg-brand/15 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                            App
                          </span>
                        </span>
                      ) : (
                        <button
                          onClick={(e) => onOpenProfile(m.senderId, e.currentTarget.getBoundingClientRect())}
                          className="text-[15px] font-semibold text-content hover:underline
                            focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                        >
                          {name}
                        </button>
                      )}
                      <time
                        dateTime={m.createdAt}
                        className="text-xs text-content-muted"
                        title={new Date(m.createdAt).toLocaleString()}
                      >
                        {time}
                      </time>
                    </div>
                  )}

                  {m.body && (
                    <p
                      className={`whitespace-pre-wrap break-words text-[15px] leading-[1.45] text-content
                        ${m.status === 'pending' ? 'opacity-50' : ''}`}
                    >
                      <Linkified text={m.body} />
                    </p>
                  )}

                  {m.attachmentKey && (
                    <Attachment attachmentKey={m.attachmentKey} onOpenImage={onOpenImage} />
                  )}

                  <CitationChips citations={citations} onJumpTo={onJumpTo} />

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
                    section 1, so the toolbar holds copy only. */}
                {m.body && (
                  <div
                    className="absolute -top-3 right-4 hidden rounded-lg border border-border-subtle bg-surface-raised
                      p-0.5 shadow-md group-hover:flex group-focus-within:flex"
                  >
                    <button
                      onClick={() => copyMessage(m.body!)}
                      title="Copy text"
                      aria-label="Copy message text"
                      className="flex size-7 items-center justify-center rounded-md text-[15px] text-content-muted
                        transition hover:bg-surface-sunken hover:text-content
                        focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                    >
                      <CopyIcon />
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
          className="animate-pop-in absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2
            rounded-full border border-border-subtle bg-surface-raised px-3.5 py-1.5 text-xs font-medium text-content
            shadow-lg transition hover:bg-surface-sunken
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {missed > 0 && (
            <span className="rounded-full bg-brand px-1.5 py-px text-[11px] text-brand-content tabular-nums">
              {missed > 99 ? '99+' : missed}
            </span>
          )}
          <span>{missed > 0 ? 'New messages' : hasMoreNewer ? 'Jump to present' : 'Latest'}</span>
          <ArrowDownIcon size={14} strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}
