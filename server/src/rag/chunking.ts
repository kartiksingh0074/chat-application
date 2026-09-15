/**
 * Which messages are worth embedding (PROJECT.md 8.3).
 *
 * Kept apart from `embeddings.ts` on purpose. The persist worker needs this
 * check on every message, and importing it from the embedding client would load
 * the ONNX runtime into a process that never embeds anything.
 */

/**
 * "ok", "thanks" and "lol" carry nothing a question could be answered from,
 * and in a busy room they are a large share of all messages.
 */
export const MIN_EMBEDDABLE_LENGTH = 15;

export function isEmbeddable(body: string | null): body is string {
  return body !== null && body.trim().length >= MIN_EMBEDDABLE_LENGTH;
}
