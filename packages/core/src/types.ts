import type { Tier } from './tier.js';

export interface LLMMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface LLMRequest {
  readonly model: string;
  readonly messages: readonly LLMMessage[];
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  /** Hard cap on USD for this single request across any tier. */
  readonly maxCostUSD?: number;
  /** Required capabilities; the router uses these to evaluate fits. */
  readonly requires?: Partial<{
    tools: boolean;
    structuredOutput: boolean;
    streaming: boolean;
    minContextWindowTokens: number;
  }>;
}

export interface LLMUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUSD: number;
}

export interface LLMResponse {
  readonly text: string;
  readonly tier: Tier;
  readonly model: string;
  readonly usage: LLMUsage;
  readonly fallChain: readonly FallDiagnostic[];
}

export interface FallDiagnostic {
  readonly tier: Tier;
  readonly adapterName: string;
  readonly reason: 'budget' | 'capability' | 'provider-unavailable' | 'unknown';
  readonly detail: string;
}
