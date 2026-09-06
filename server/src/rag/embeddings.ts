import { EMBEDDING_DIMENSIONS } from '../db/schema.js';
import { env } from '../config/env.js';

/**
 * Embedding client for Groq's OpenAI-compatible endpoint.
 *
 * Two things here are easy to get wrong and silent when you do.
 *
 * 1. `nomic-embed-text-v1_5` requires a task instruction prefix. Documents and
 *    queries must be embedded with *different* prefixes, and omitting them does
 *    not error - it just retrieves worse. That would quietly bias every number
 *    in 8.8, so the prefix is applied here rather than left to callers.
 *
 * 2. pgvector fixes the vector width in the column type. If the model returns a
 *    different width than the schema was built for, the insert fails with an
 *    opaque error far from the cause - so the width is checked on first use and
 *    reported plainly.
 */

/** Prefix for corpus text being indexed. */
const DOCUMENT_PREFIX = 'search_document: ';
/** Prefix for a question being matched against the corpus. */
const QUERY_PREFIX = 'search_query: ';

export class MissingApiKeyError extends Error {
  constructor() {
    super('GROQ_API_KEY is not set, so embedding and generation are unavailable');
    this.name = 'MissingApiKeyError';
  }
}

export class EmbeddingDimensionError extends Error {
  constructor(actual: number) {
    super(
      `Embedding model returned ${actual} dimensions but the schema expects ` +
        `${EMBEDDING_DIMENSIONS}. Change EMBEDDING_DIMENSIONS in db/schema.ts and ` +
        `generate a migration, or switch GROQ_EMBED_MODEL back.`,
    );
    this.name = 'EmbeddingDimensionError';
  }
}

interface EmbeddingResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
}

async function callEmbeddings(inputs: string[]): Promise<number[][]> {
  if (!env.GROQ_API_KEY) throw new MissingApiKeyError();

  const res = await fetch(`${env.GROQ_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model: env.GROQ_EMBED_MODEL, input: inputs }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`embedding request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const body = (await res.json()) as EmbeddingResponse;

  // The API is not required to preserve input order; `index` is authoritative.
  const ordered = [...body.data].sort((a, b) => a.index - b.index);
  const vectors = ordered.map((d) => d.embedding);

  for (const vector of vectors) {
    if (vector.length !== EMBEDDING_DIMENSIONS) throw new EmbeddingDimensionError(vector.length);
  }

  return vectors;
}

/** Embed messages for storage. Callers pass raw bodies; prefixing happens here. */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return callEmbeddings(texts.map((t) => DOCUMENT_PREFIX + t));
}

/** Embed a question for search. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await callEmbeddings([QUERY_PREFIX + text]);
  if (!vector) throw new Error('embedding request returned no vector');
  return vector;
}

/**
 * 8.3: skip very short messages. "ok" and "thanks" carry no retrievable
 * meaning, and at ~500k messages they would be most of the embedding bill.
 */
export const MIN_EMBEDDABLE_LENGTH = 15;

export function isEmbeddable(body: string | null): body is string {
  return body !== null && body.trim().length >= MIN_EMBEDDABLE_LENGTH;
}
