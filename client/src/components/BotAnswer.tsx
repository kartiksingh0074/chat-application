import type { BotStream } from '../hooks/botStreamReducer.js';
import { Linkified } from '../ui/linkify.js';
import { CloseIcon, SparkleIcon } from '../ui/icons.js';

interface CitationChipsProps {
  citations: string[];
  onJumpTo: (messageId: string) => void;
}

/**
 * Each chip is a message the answer was drawn from (PROJECT.md 8.6). Clicking
 * one scrolls to that message, loading the surrounding page first when it is
 * not in the current window. Numbered to match the [n] markers in the answer.
 */
export function CitationChips({ citations, onJumpTo }: CitationChipsProps) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">Sources</span>
      {citations.map((messageId, i) => (
        <button
          key={messageId}
          onClick={() => onJumpTo(messageId)}
          title="Jump to this message"
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-brand/12 px-1.5 text-[11px]
            font-semibold text-brand tabular-nums transition hover:bg-brand/25
            focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
        >
          {i + 1}
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
      className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse rounded-full bg-brand"
    />
  );
}

interface BotAnswerProps {
  stream: BotStream;
  onJumpTo: (messageId: string) => void;
  onDismiss: (queryId: string) => void;
}

/**
 * A bot answer that has not been saved yet.
 *
 * It renders outside the virtualized list on purpose: tokens arrive several
 * times a second, and pushing each one through Virtuoso as a changed item would
 * re-measure the list on every character. Once the answer is saved it becomes an
 * ordinary message, and this is hidden in favour of it. Styled like a message
 * row so the hand-over is not visible.
 */
export function BotAnswer({ stream, onJumpTo, onDismiss }: BotAnswerProps) {
  const streaming = stream.status === 'streaming';

  return (
    <div className="animate-message-in group relative flex shrink-0 gap-3.5 px-4 pb-2 pt-3">
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-[20px]
          text-brand-content ${streaming ? 'animate-pulse' : ''}`}
      >
        <SparkleIcon />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold text-brand">
            Bot
            <span className="rounded bg-brand/15 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
              App
            </span>
          </span>
          <span className="text-xs text-content-muted">
            {streaming ? 'Searching this room and writing an answer…' : null}
          </span>
        </div>

        {stream.status === 'error' ? (
          <p className="text-[15px] leading-[1.45] text-danger">{stream.error ?? 'The bot could not answer.'}</p>
        ) : (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.45] text-content">
            <Linkified text={stream.text} />
            {streaming && <StreamingCaret />}
          </p>
        )}

        <CitationChips citations={stream.citations} onJumpTo={onJumpTo} />
      </div>

      {!streaming && (
        <button
          onClick={() => onDismiss(stream.queryId)}
          aria-label="Dismiss"
          title="Dismiss"
          className="absolute right-4 top-3 flex size-7 items-center justify-center rounded-md text-content-muted
            opacity-0 transition hover:bg-surface-sunken hover:text-content group-hover:opacity-100
            focus-visible:opacity-100"
        >
          <CloseIcon size={15} />
        </button>
      )}
    </div>
  );
}
