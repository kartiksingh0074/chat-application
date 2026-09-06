import { describe, expect, it } from 'vitest';
import {
  attachmentDisplayName,
  extensionForType,
  isBlockedAttachmentType,
  isImageAttachment,
  sanitizeFilename,
} from '@chat-application/shared';

describe('extensionForType', () => {
  it('maps a known type', () => {
    expect(extensionForType('image/png')).toBe('.png');
    expect(extensionForType('application/pdf')).toBe('.pdf');
  });

  it('ignores charset parameters and casing', () => {
    expect(extensionForType('TEXT/PLAIN; charset=utf-8')).toBe('.txt');
  });

  it('falls back to .bin for anything unknown', () => {
    expect(extensionForType('application/x-made-up')).toBe('.bin');
  });
});

describe('isBlockedAttachmentType', () => {
  it('blocks types that execute when fetched', () => {
    expect(isBlockedAttachmentType('text/html')).toBe(true);
    expect(isBlockedAttachmentType('image/svg+xml')).toBe(true);
    expect(isBlockedAttachmentType('TEXT/HTML; charset=utf-8')).toBe(true);
  });

  it('allows inert types', () => {
    expect(isBlockedAttachmentType('image/png')).toBe(false);
    expect(isBlockedAttachmentType('application/pdf')).toBe(false);
  });
});

describe('isImageAttachment', () => {
  it('recognises image extensions', () => {
    expect(isImageAttachment('room/01ABC-photo.png')).toBe(true);
    expect(isImageAttachment('room/01ABC-photo.JPG')).toBe(true);
  });

  it('treats documents as non-images', () => {
    expect(isImageAttachment('room/01ABC-report.pdf')).toBe(false);
    expect(isImageAttachment('room/01ABC-data.bin')).toBe(false);
  });

  it('treats extensionless legacy keys as images', () => {
    // Keys written before this change came from an image-only picker.
    expect(isImageAttachment('room/01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
  });

  it('is not fooled by a dot in the room segment', () => {
    expect(isImageAttachment('my.room/01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
  });
});

describe('attachmentDisplayName', () => {
  it('strips the room prefix and the ULID', () => {
    expect(attachmentDisplayName('room1/01ARZ3NDEKTSV4RRFFQ69G5FAV-report.pdf')).toBe('report.pdf');
  });

  it('falls back to the bare key when there is no name', () => {
    expect(attachmentDisplayName('room1/01ARZ3NDEKTSV4RRFFQ69G5FAV.pdf')).toBe('.pdf');
  });
});

describe('sanitizeFilename', () => {
  it('keeps an ordinary name and drops the extension', () => {
    expect(sanitizeFilename('quarterly report.pdf')).toBe('quarterly-report');
  });

  it('strips path separators', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\me\\secret.txt')).toBe('secret');
  });

  it('removes characters that are significant in a URL', () => {
    expect(sanitizeFilename('a?b#c&d=e.txt')).toBe('a-b-c-d-e');
  });

  it('caps the length', () => {
    expect(sanitizeFilename('x'.repeat(200) + '.txt')).toHaveLength(48);
  });

  it('returns empty for a name with nothing usable left', () => {
    expect(sanitizeFilename('...')).toBe('');
  });
});
