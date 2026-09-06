import { describe, expect, it } from 'vitest';
import { splitLinks } from './linkify.js';

describe('splitLinks', () => {
  it('leaves text with no URL untouched', () => {
    expect(splitLinks('just a message')).toEqual([{ type: 'text', value: 'just a message' }]);
  });

  it('splits a URL out of surrounding text', () => {
    expect(splitLinks('see https://example.com now')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', value: 'https://example.com', href: 'https://example.com' },
      { type: 'text', value: ' now' },
    ]);
  });

  it('gives a bare www host an https scheme', () => {
    const [link] = splitLinks('www.example.com');
    expect(link).toEqual({
      type: 'link',
      value: 'www.example.com',
      href: 'https://www.example.com',
    });
  });

  it('leaves sentence punctuation outside the link', () => {
    expect(splitLinks('go to https://example.com/docs.')).toEqual([
      { type: 'text', value: 'go to ' },
      { type: 'link', value: 'https://example.com/docs', href: 'https://example.com/docs' },
      { type: 'text', value: '.' },
    ]);
  });

  it('keeps balanced brackets that belong to the URL', () => {
    const [link] = splitLinks('https://en.wikipedia.org/wiki/Foo_(bar)');
    expect(link?.value).toBe('https://en.wikipedia.org/wiki/Foo_(bar)');
  });

  it('drops an unmatched closing bracket', () => {
    expect(splitLinks('(see https://example.com)')).toEqual([
      { type: 'text', value: '(see ' },
      { type: 'link', value: 'https://example.com', href: 'https://example.com' },
      { type: 'text', value: ')' },
    ]);
  });

  it('finds every URL in one message', () => {
    const links = splitLinks('a https://one.com b http://two.com c').filter((s) => s.type === 'link');
    expect(links.map((l) => l.value)).toEqual(['https://one.com', 'http://two.com']);
  });

  it('does not turn a dangerous scheme into a link', () => {
    // eslint-disable-next-line no-script-url
    const segments = splitLinks('javascript:alert(1) and data:text/html,<script>');
    expect(segments.every((s) => s.type === 'text')).toBe(true);
  });

  it('always advances past a bare www.', () => {
    expect(splitLinks('www. is not a link')).toEqual([{ type: 'text', value: 'www. is not a link' }]);
  });
});
