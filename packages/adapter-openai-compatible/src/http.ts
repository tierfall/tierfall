import { BudgetExceededError, ProviderUnavailableError } from '@tierfall/core';

export interface OpenAICompatibleMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface OpenAICompatibleChatRequest {
  readonly model: string;
  readonly messages: readonly OpenAICompatibleMessage[];
  readonly max_tokens?: number;
  readonly stream: false;
}

export interface OpenAICompatibleChatChoice {
  readonly index: number;
  readonly message: { readonly role: string; readonly content: string | null };
  readonly finish_reason?: string;
}

export interface OpenAICompatibleChatResponse {
  readonly id: string;
  readonly object: string;
  readonly model: string;
  readonly choices: readonly OpenAICompatibleChatChoice[];
  readonly usage: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens?: number;
  };
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * POST {baseUrl}/chat/completions against an OpenAI-compatible endpoint.
 * Maps every failure into the canonical fall errors:
 * - 429 (rate limit / quota) → BudgetExceededError
 * - Other 4xx/5xx + network + malformed-JSON + shape-violation → ProviderUnavailableError
 *
 * Times out at 30s via AbortController. Returns the raw response narrowed
 * to the fields the adapter consumes.
 *
 * `baseUrl` should include the API version segment (e.g. `/v1`); the helper
 * appends `/chat/completions`. Trailing slashes on `baseUrl` are normalized.
 */
export async function postChatCompletions(
  baseUrl: string,
  apiKey: string,
  body: OpenAICompatibleChatRequest,
): Promise<OpenAICompatibleChatResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ProviderUnavailableError(
      `OpenAI-compatible request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '<unreadable body>');
    if (response.status === 429) {
      throw new BudgetExceededError(`OpenAI-compatible 429 rate limit / quota: ${text}`);
    }
    throw new ProviderUnavailableError(
      `OpenAI-compatible ${String(response.status)} ${response.statusText}: ${text}`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new ProviderUnavailableError(
      `OpenAI-compatible returned malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  if (!isValidChatResponse(data)) {
    throw new ProviderUnavailableError(
      `OpenAI-compatible returned unexpected shape: ${JSON.stringify(data)}`,
    );
  }
  return data;
}

function isValidChatResponse(value: unknown): value is OpenAICompatibleChatResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.choices)) return false;
  if (obj.choices.length === 0) return false;
  if (typeof obj.usage !== 'object' || obj.usage === null) return false;
  const usage = obj.usage as Record<string, unknown>;
  return typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number';
}
