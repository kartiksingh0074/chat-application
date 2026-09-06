import { Fragment, type ReactNode } from 'react';

export interface TextSegment {
  type: 'text' | 'link';
  value: string;
  /** Present on links only: what the anchor navigates to. */
  href?: string;
}

// Only http(s) and bare www. are recognised, so `javascript:` and `data:`
// cannot become an href by construction. Message bodies are rendered as React
// nodes, never as HTML, so nothing here needs escaping.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?']);

/**
 * Drop punctuation that belongs to the surrounding sentence rather than the
 * URL. A closing bracket only counts as punctuation when it is unmatched, so
 * links that legitimately contain brackets survive.
 */
function trimTrailing(url: string): string {
  let end = url.length;

  while (end > 0) {
    const char = url[end - 1]!;

    if (TRAILING_PUNCTUATION.has(char)) {
      end -= 1;
      continue;
    }

    if (char === ')' || char === ']') {
      const open = char === ')' ? '(' : '[';
      const slice = url.slice(0, end);
      const opens = slice.split(open).length - 1;
      const closes = slice.split(char).length - 1;
      if (closes > opens) {
        end -= 1;
        continue;
      }
    }

    break;
  }

  return url.slice(0, end);
}

/** Split a message body into plain runs and link runs. Pure, so it is unit-tested. */
export function splitLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const pattern = new RegExp(URL_PATTERN.source, URL_PATTERN.flags);
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const url = trimTrailing(match[0]);

    // Nothing left after trimming (e.g. a bare "www."): treat it as text and
    // keep scanning past it so the loop always advances.
    if (url.length === 0 || url === 'www.') {
      pattern.lastIndex = match.index + match[0].length;
      continue;
    }

    if (match.index > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, match.index) });
    }

    segments.push({
      type: 'link',
      value: url,
      href: url.toLowerCase().startsWith('www.') ? `https://${url}` : url,
    });

    cursor = match.index + url.length;
    pattern.lastIndex = cursor;
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }

  return segments;
}

/** Renders a message body with URLs turned into anchors. */
export function Linkified({ text }: { text: string }): ReactNode {
  return splitLinks(text).map((segment, i) =>
    segment.type === 'link' ? (
      <a
        key={i}
        href={segment.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-brand underline underline-offset-2 hover:no-underline"
      >
        {segment.value}
      </a>
    ) : (
      <Fragment key={i}>{segment.value}</Fragment>
    ),
  );
}
