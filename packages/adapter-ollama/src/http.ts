import { ProviderUnavailableError } from '@tierfall/core';

export interface OllamaChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface OllamaChatRequest {
  readonly model: string;
  readonly messages: readonly OllamaChatMessage[];
  readonly stream: false;
}

export interface OllamaChatResponse {
  readonly message: { readonly role: string; readonly content: string };
  readonly prompt_eval_count?: number;
  readonly eval_count?: number;
  readonly done_reason?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * POST /api/chat against the Ollama daemon at `baseUrl`. Maps every failure
 * into `ProviderUnavailableError` with a useful detail string. Times out at 30s.
 *
 * Returns the raw Ollama response narrowed to the fields the adapter consumes.
 * Trailing `/` on `baseUrl` is normalized away to avoid double slashes.
 */
export async function postChat(
  baseUrl: string,
  body: OllamaChatRequest,
): Promise<OllamaChatResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ProviderUnavailableError(
      `Ollama request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '<unreadable body>');
    throw new ProviderUnavailableError(
      `Ollama ${String(response.status)} ${response.statusText}: ${text}`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new ProviderUnavailableError(
      `Ollama returned malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  if (!isValidChatResponse(data)) {
    throw new ProviderUnavailableError(`Ollama returned unexpected shape: ${JSON.stringify(data)}`);
  }
  return data;
}

function isValidChatResponse(value: unknown): value is OllamaChatResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  const message = obj.message;
  if (typeof message !== 'object' || message === null) return false;
  const msg = message as Record<string, unknown>;
  return typeof msg.content === 'string';
}
