import type { BotStream } from '../hooks/botStreamReducer.js';
import { Linkified } from '../ui/linkify.js';

interface CitationChipsProps {
  citations: string[];
  onJumpTo: (messageId: string) => void;
}

/**
 * Each chip is a message id the answer was drawn from (PROJECT.md 8.6).
 * Clicking one scrolls the list to that message, loading the surrounding page
 * first when it is not in the current window.
 */
export function CitationChips({ citations, onJumpTo }: CitationChipsProps) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-content-muted">Sources:</span>
      {citations.map((messageId, i) => (
        <button
          key={messageId}
          onClick={() => onJumpTo(messageId)}
          title={messageId}
          className="rounded-full border border-brand/40 bg-brand-subtle px-2 py-0.5 text-xs font-medium
            text-brand transition hover:border-brand focus-visible:outline-2
            focus-visible:outline-offset-1 focus-visible:outline-brand"
        >
          [{i + 1}]
        </button>
      ))}
    </div>
  );
}

/** The blinking cursor shown while tokens are still arriving. */
function StreamingCaret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-brand align-baseline"
    />
  );
}

interface BotAnswerProps {
  stream: BotStream;
  onJumpTo: (messageId: string) => void;
  onDismiss: (queryId: string) => void;
}

/**
 * A bot answer that has not been persisted yet.
 *
 * It renders outside the virtualized list on purpose: tokens arrive several
 * times a second, and pushing each one through Virtuoso as a changed item
 * would re-measure the list on every character. Once the answer is saved it
 * becomes an ordinary message and the list takes over.
 */
export function BotAnswer({ stream, onJumpTo, onDismiss }: BotAnswerProps) {
  return (
    <div className="border-t border-border-subtle bg-brand-subtle/25 px-4 py-2.5">
      <div className="flex gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-content"
        >
          ✦
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-brand">Bot</span>
            <span className="text-xs text-content-muted">
              {stream.status === 'streaming' ? 'answering…' : 'from this room’s history'}
            </span>
            {stream.status !== 'streaming' && (
              <button
                onClick={() => onDismiss(stream.queryId)}
                className="ml-auto text-xs text-content-muted hover:text-content"
              >
                Dismiss
              </button>
            )}
          </div>

          {stream.status === 'error' ? (
            <p className="text-sm text-danger">{stream.error ?? 'The bot could not answer.'}</p>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm text-content">
              <Linkified text={stream.text} />
              {stream.status === 'streaming' && <StreamingCaret />}
            </p>
          )}

          <CitationChips citations={stream.citations} onJumpTo={onJumpTo} />
        </div>
      </div>
    </div>
  );
}
