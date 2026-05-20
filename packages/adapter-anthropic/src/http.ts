import { BudgetExceededError, ProviderUnavailableError } from '@tierfall/core';

export interface AnthropicMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface AnthropicMessagesRequest {
  readonly model: string;
  readonly messages: readonly AnthropicMessage[];
  readonly max_tokens: number;
  readonly system?: string;
}

export interface AnthropicContentBlock {
  readonly type: string;
  readonly text?: string;
}

export interface AnthropicMessagesResponse {
  readonly id: string;
  readonly type: string;
  readonly role: string;
  readonly model: string;
  readonly content: readonly AnthropicContentBlock[];
  readonly stop_reason?: string;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  };
}

const DEFAULT_TIMEOUT_MS = 30_000;
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * POST /v1/messages against Anthropic's API. Maps every failure into the
 * canonical fall errors:
 * - 429 (rate limit / quota) → BudgetExceededError
 * - All other 4xx/5xx + network + malformed-JSON + shape-violation → ProviderUnavailableError
 *
 * Times out at 30s via AbortController. Returns the raw response narrowed
 * to the fields the adapter consumes.
 */
export async function postMessages(
  baseUrl: string,
  apiKey: string,
  body: AnthropicMessagesRequest,
): Promise<AnthropicMessagesResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`;
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
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ProviderUnavailableError(
      `Anthropic request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '<unreadable body>');
    if (response.status === 429) {
      throw new BudgetExceededError(`Anthropic 429 rate limit / quota: ${text}`);
    }
    throw new ProviderUnavailableError(
      `Anthropic ${String(response.status)} ${response.statusText}: ${text}`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new ProviderUnavailableError(
      `Anthropic returned malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  if (!isValidMessagesResponse(data)) {
    throw new ProviderUnavailableError(
      `Anthropic returned unexpected shape: ${JSON.stringify(data)}`,
    );
  }
  return data;
}

function isValidMessagesResponse(value: unknown): value is AnthropicMessagesResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.content)) return false;
  if (typeof obj.usage !== 'object' || obj.usage === null) return false;
  const usage = obj.usage as Record<string, unknown>;
  return typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number';
}
