import { env } from '../config/env.js';
import type { ChatMessage } from './prompt.js';

export class MissingApiKeyError extends Error {
  constructor() {
    super('GROQ_API_KEY is not set, so the bot cannot generate answers');
    this.name = 'MissingApiKeyError';
  }
}

/** Long enough for a slow free-tier response, short enough not to hang a room. */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Streams a chat completion from Groq's OpenAI-compatible endpoint, calling
 * `onToken` for each piece of answer text, and resolves with the full text.
 *
 * Only `delta.content` is ever forwarded. The configured model is a reasoning
 * model, and by default Groq streams its private reasoning first in a separate
 * `reasoning` field - forwarding every chunk would post that into the room and
 * save it as the bot's message. `include_reasoning: false` asks Groq not to send
 * it, and reading only `content` keeps it out even if a model sends it anyway.
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  onToken: (token: string) => void,
): Promise<string> {
  if (!env.GROQ_API_KEY) throw new MissingApiKeyError();

  const response = await fetch(`${env.GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.GROQ_CHAT_MODEL,
      messages,
      stream: true,
      // Low temperature: the job is to restate the sources, not to be creative.
      temperature: 0.2,
      include_reasoning: false,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Groq request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Server-sent events: one `data: {...}` per line; the last line may be partial.
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;

      const chunk = JSON.parse(payload) as {
        error?: { message?: string };
        choices?: { delta?: { content?: string | null } }[];
      };
      if (chunk.error) throw new Error(`Groq stream error: ${chunk.error.message ?? 'unknown'}`);

      const token = chunk.choices?.[0]?.delta?.content;
      if (token) {
        text += token;
        onToken(token);
      }
    }
  }

  return text;
}
