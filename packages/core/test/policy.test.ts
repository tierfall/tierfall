import { DefaultPolicy } from '../src/policy.js';
import type { LLMRequest } from '../src/index.js';
import { fakeAdapter } from './helpers/adapters.js';

const baseRequest: LLMRequest = {
  model: 'm',
  messages: [{ role: 'user', content: 'hi' }],
};

describe('DefaultPolicy (closes #3)', () => {
  it('closes #3: empty adapter list returns empty result', () => {
    const policy = new DefaultPolicy();
    expect(policy.evaluate(baseRequest, [])).toEqual([]);
  });

  it('closes #3: sort by tier-index ascending (premium first → on-device last)', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('local', 'on-device'),
      fakeAdapter('premium', 'premium-cloud'),
      fakeAdapter('cheap', 'cheap-cloud'),
    ];
    const result = policy.evaluate(baseRequest, input);
    expect(result.map((a) => a.name)).toEqual(['premium', 'cheap', 'local']);
  });

  it('closes #3: stable sort preserves input order within a tier', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('premiumA', 'premium-cloud'),
      fakeAdapter('premiumB', 'premium-cloud'),
    ];
    const result = policy.evaluate(baseRequest, input);
    expect(result.map((a) => a.name)).toEqual(['premiumA', 'premiumB']);
  });

  it('closes #3: filter by minContextWindowTokens excludes adapters below', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('big', 'premium-cloud', { capability: { contextWindowTokens: 32768 } }),
      fakeAdapter('small', 'on-device', { capability: { contextWindowTokens: 8192 } }),
    ];
    const result = policy.evaluate(
      { ...baseRequest, requires: { minContextWindowTokens: 16000 } },
      input,
    );
    expect(result.map((a) => a.name)).toEqual(['big']);
  });

  it('closes #3: filter by tools=true excludes adapters where supportsTools is false', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('with-tools', 'premium-cloud', { capability: { supportsTools: true } }),
      fakeAdapter('no-tools', 'on-device', { capability: { supportsTools: false } }),
    ];
    const result = policy.evaluate({ ...baseRequest, requires: { tools: true } }, input);
    expect(result.map((a) => a.name)).toEqual(['with-tools']);
  });

  it('closes #3: filter by streaming=true excludes adapters where supportsStreaming is false', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('with-stream', 'premium-cloud', { capability: { supportsStreaming: true } }),
      fakeAdapter('no-stream', 'on-device', { capability: { supportsStreaming: false } }),
    ];
    const result = policy.evaluate({ ...baseRequest, requires: { streaming: true } }, input);
    expect(result.map((a) => a.name)).toEqual(['with-stream']);
  });

  it('closes #3: filter by structuredOutput=true excludes adapters where supportsStructuredOutput is false', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('structured', 'premium-cloud', {
        capability: { supportsStructuredOutput: true },
      }),
      fakeAdapter('plain', 'on-device', { capability: { supportsStructuredOutput: false } }),
    ];
    const result = policy.evaluate({ ...baseRequest, requires: { structuredOutput: true } }, input);
    expect(result.map((a) => a.name)).toEqual(['structured']);
  });

  it('closes #3: filter by maxCostUSD excludes adapters whose 500+500-token cost exceeds the cap', () => {
    const policy = new DefaultPolicy();
    const input = [
      // ($30/M * 500) + ($60/M * 500) = $0.015 + $0.030 = $0.045 per request — exceeds $0.001
      fakeAdapter('expensive', 'premium-cloud', {
        capability: { costPerMillionInputTokens: 30, costPerMillionOutputTokens: 60 },
      }),
      // null/null → 0 cost
      fakeAdapter('free', 'on-device'),
    ];
    const result = policy.evaluate({ ...baseRequest, maxCostUSD: 0.001 }, input);
    expect(result.map((a) => a.name)).toEqual(['free']);
  });

  it('closes #3: maxCostUSD comparison is strict greater-than (equality survives)', () => {
    const policy = new DefaultPolicy();
    // ($2/M * 500) + ($2/M * 500) = $0.001 + $0.001 = $0.002 per request — equals cap
    const input = [
      fakeAdapter('on-cap', 'premium-cloud', {
        capability: { costPerMillionInputTokens: 2, costPerMillionOutputTokens: 2 },
      }),
    ];
    const result = policy.evaluate({ ...baseRequest, maxCostUSD: 0.002 }, input);
    expect(result.map((a) => a.name)).toEqual(['on-cap']);
  });

  it('closes #3: filters combine with AND — adapter must pass every requires field', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('only-tools', 'premium-cloud', {
        capability: { supportsTools: true, contextWindowTokens: 4000 },
      }),
      fakeAdapter('only-context', 'cheap-cloud', {
        capability: { supportsTools: false, contextWindowTokens: 200_000 },
      }),
      fakeAdapter('both', 'on-device', {
        capability: { supportsTools: true, contextWindowTokens: 100_000 },
      }),
    ];
    const result = policy.evaluate(
      { ...baseRequest, requires: { tools: true, minContextWindowTokens: 100_000 } },
      input,
    );
    expect(result.map((a) => a.name)).toEqual(['both']);
  });

  it('closes #3: all adapters filtered out → empty result (caller-driven empty downstream)', () => {
    const policy = new DefaultPolicy();
    const input = [
      fakeAdapter('no-tools-a', 'premium-cloud', { capability: { supportsTools: false } }),
      fakeAdapter('no-tools-b', 'cheap-cloud', { capability: { supportsTools: false } }),
    ];
    const result = policy.evaluate({ ...baseRequest, requires: { tools: true } }, input);
    expect(result).toEqual([]);
  });
});
