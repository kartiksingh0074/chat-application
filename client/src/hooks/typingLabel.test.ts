import { describe, expect, it } from 'vitest';
import { typingLabel } from './useTyping.js';

describe('typingLabel', () => {
  it('is empty when nobody is typing, so the composer shows its hint instead', () => {
    expect(typingLabel([])).toBe('');
  });

  it('names one person', () => {
    expect(typingLabel(['alice'])).toBe('alice is typing…');
  });

  it('names two', () => {
    expect(typingLabel(['alice', 'bob'])).toBe('alice and bob are typing…');
  });

  it('counts three or more rather than listing them', () => {
    expect(typingLabel(['alice', 'bob', 'carol'])).toBe('3 people are typing…');
    expect(typingLabel(['a', 'b', 'c', 'd'])).toBe('4 people are typing…');
  });
});
