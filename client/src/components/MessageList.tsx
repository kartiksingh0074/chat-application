import { Virtuoso } from 'react-virtuoso';
import type { DisplayMessage } from '../hooks/useMessages.js';
import { attachmentUrl } from '../config.js';
import { Avatar } from '../ui/primitives.js';

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
  return (
    <Virtuoso
      className="flex-1"
      data={messages}
      firstItemIndex={firstItemIndex}
      initialTopMostItemIndex={Math.max(0, messages.length - 1)}
      startReached={loadOlder}
      followOutput="smooth"
      computeItemKey={(_, m) => m.tempId ?? m.id}
      itemContent={(index, m) => {
        const arrayIndex = index - firstItemIndex;
        const previous = arrayIndex > 0 ? messages[arrayIndex - 1] : undefined;
        const newDay = !previous || dayKey(previous.createdAt) !== dayKey(m.createdAt);
        const grouped = !newDay && !startsGroup(m, previous);
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
              className={`group flex gap-3 px-4 hover:bg-surface-sunken/50 ${grouped ? 'py-0.5' : 'pt-2 pb-0.5'}`}
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
                    {m.body}
                  </p>
                )}

                {m.attachmentKey && (
                  <button
                    onClick={() => onOpenImage(attachmentUrl(m.attachmentKey!))}
                    className="mt-1 block overflow-hidden rounded-card border border-border-subtle
                      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <img
                      src={attachmentUrl(m.attachmentKey)}
                      alt="Attachment"
                      loading="lazy"
                      className="max-h-72 max-w-xs object-cover"
                    />
                  </button>
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
            </div>
          </div>
        );
      }}
    />
  );
}
