import { fileURLToPath } from 'node:url';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import { EMBEDDING_DIMENSIONS } from '../db/schema.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

/**
 * Local embedding client: `bge-small-en-v1.5` run in-process by transformers.js,
 * the alternative PROJECT.md 2 names alongside a hosted model.
 *
 * Local rather than hosted because 8.8 is a benchmark meant to be re-run: no
 * key, no request cap to hit while tuning, and a model that cannot change
 * underneath a measurement. It runs on the CPU and needs no GPU.
 *
 * Three details here are silent when wrong, so they live in this one file:
 *
 * 1. BGE prefixes the *query* only - "Represent this sentence for searching
 *    relevant passages: " - and never the documents. (Nomic, considered earlier,
 *    prefixes both. The conventions are opposite, and a swapped prefix degrades
 *    retrieval without erroring.)
 * 2. BGE uses CLS pooling, not mean pooling, and vectors are normalised so
 *    cosine distance in pgvector means what it says.
 * 3. The model's width is asserted against the column type, so a model swap
 *    fails here with a clear message rather than as an opaque insert error.
 */

const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

/** Downloaded weights live here (gitignored), so the model is fetched once. */
const CACHE_DIR = fileURLToPath(new URL('../../.cache/models', import.meta.url));

export class EmbeddingDimensionError extends Error {
  constructor(actual: number) {
    super(
      `Embedding model returned ${actual} dimensions but the schema expects ` +
        `${EMBEDDING_DIMENSIONS}. Change EMBEDDING_DIMENSIONS in db/schema.ts and ` +
        `generate a migration, or set EMBED_MODEL back.`,
    );
    this.name = 'EmbeddingDimensionError';
  }
}

let loading: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Loaded on first use, not at import. The first call downloads the weights
 * (~130 MB) and takes tens of seconds; later calls reuse the cached model.
 */
function getExtractor(): Promise<FeatureExtractionPipeline> {
  loading ??= (async () => {
    const started = performance.now();
    const transformers = await import('@huggingface/transformers');
    transformers.env.cacheDir = CACHE_DIR;
    const extractor = (await transformers.pipeline('feature-extraction', env.EMBED_MODEL, {
      dtype: 'fp32',
    })) as FeatureExtractionPipeline;
    logger.info(
      { model: env.EMBED_MODEL, ms: Math.round(performance.now() - started) },
      'embedding model loaded',
    );
    return extractor;
  })();
  return loading;
}

async function embed(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const extractor = await getExtractor();
  const output = await extractor(inputs, { pooling: 'cls', normalize: true });
  const vectors = output.tolist() as number[][];

  for (const vector of vectors) {
    if (vector.length !== EMBEDDING_DIMENSIONS) throw new EmbeddingDimensionError(vector.length);
  }
  return vectors;
}

/** Embed messages for storage. No prefix: BGE instructs queries only. */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  return embed(texts);
}

/** Embed a question for search, with BGE's retrieval instruction. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([QUERY_PREFIX + text]);
  if (!vector) throw new Error('embedding returned no vector');
  return vector;
}

/** Load the model ahead of time, so the first real call is not the slow one. */
export async function warmUpEmbeddings(): Promise<void> {
  await embed(['warm up']);
}
