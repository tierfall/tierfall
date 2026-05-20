import type { Adapter, AdapterCapability, LLMRequest } from '../src/index.js';
import { DefaultPolicy, Router } from '../src/index.js';
import {
  BudgetExceededError,
  CapabilityMismatchError,
  NoTierAvailableError,
  ProviderUnavailableError,
} from '../src/errors.js';
import { fakeAdapter } from './helpers/adapters.js';

const PREMIUM_CAP: AdapterCapability = {
  contextWindowTokens: 200_000,
  supportsTools: true,
  supportsStreaming: true,
  supportsStructuredOutput: true,
  costPerMillionInputTokens: 5,
  costPerMillionOutputTokens: 15,
};

const CHEAP_CAP: AdapterCapability = {
  contextWindowTokens: 32_000,
  supportsTools: false,
  supportsStreaming: true,
  supportsStructuredOutput: false,
  costPerMillionInputTokens: 0.5,
  costPerMillionOutputTokens: 1.5,
};

const LOCAL_CAP: AdapterCapability = {
  contextWindowTokens: 8_192,
  supportsTools: false,
  supportsStreaming: true,
  supportsStructuredOutput: false,
  costPerMillionInputTokens: null,
  costPerMillionOutputTokens: null,
};

function makeStack(opts?: {
  premiumComplete?: Adapter['complete'];
  cheapComplete?: Adapter['complete'];
  localComplete?: Adapter['complete'];
}): readonly Adapter[] {
  return [
    fakeAdapter('premium', 'premium-cloud', {
      capability: PREMIUM_CAP,
      ...(opts?.premiumComplete ? { complete: opts.premiumComplete } : {}),
    }),
    fakeAdapter('cheap', 'cheap-cloud', {
      capability: CHEAP_CAP,
      ...(opts?.cheapComplete ? { complete: opts.cheapComplete } : {}),
    }),
    fakeAdapter('local', 'on-device', {
      capability: LOCAL_CAP,
      ...(opts?.localComplete ? { complete: opts.localComplete } : {}),
    }),
  ];
}

const baseRequest: LLMRequest = {
  model: 'auto',
  messages: [{ role: 'user', content: 'Integration scenario.' }],
};

describe('Router + DefaultPolicy integration (closes #15)', () => {
  it('closes #15: happy path — premium succeeds, no fall', async () => {
    const stack = makeStack();
    const ordered = new DefaultPolicy().evaluate(baseRequest, stack);
    const router = new Router(ordered);

    const response = await router.complete(baseRequest);
    expect(response.tier).toBe('premium-cloud');
    expect(response.fallChain).toEqual([]);
  });

  it('closes #15: ProviderUnavailableError on premium → falls to cheap', async () => {
    const stack = makeStack({
      premiumComplete: () => Promise.reject(new ProviderUnavailableError('premium down')),
    });
    const ordered = new DefaultPolicy().evaluate(baseRequest, stack);
    const router = new Router(ordered);

    const response = await router.complete(baseRequest);
    expect(response.tier).toBe('cheap-cloud');
    expect(response.fallChain).toHaveLength(1);
    expect(response.fallChain[0]).toMatchObject({
      adapterName: 'premium',
      tier: 'premium-cloud',
      reason: 'provider-unavailable',
      detail: 'premium down',
    });
  });

  it('closes #15: budget filter excludes premium and cheap; local serves with empty fallChain', async () => {
    const stack = makeStack();
    const request: LLMRequest = { ...baseRequest, maxCostUSD: 0.0001 };
    const ordered = new DefaultPolicy().evaluate(request, stack);
    expect(ordered.map((a) => a.name)).toEqual(['local']);

    const router = new Router(ordered);
    const response = await router.complete(request);
    expect(response.tier).toBe('on-device');
    expect(response.fallChain).toEqual([]);
  });

  it('closes #15: capability filter narrows to premium; premium throws → NoTierAvailableError', async () => {
    const stack = makeStack({
      premiumComplete: () =>
        Promise.reject(new ProviderUnavailableError('premium down (tools required)')),
    });
    const request: LLMRequest = { ...baseRequest, requires: { tools: true } };
    const ordered = new DefaultPolicy().evaluate(request, stack);
    expect(ordered.map((a) => a.name)).toEqual(['premium']);

    const router = new Router(ordered);
    await expect(router.complete(request)).rejects.toBeInstanceOf(NoTierAvailableError);
    const caught = await router.complete(request).catch((e: unknown) => e);
    const err = caught as NoTierAvailableError;
    expect(err.fallChain).toHaveLength(1);
    expect(err.fallChain[0]).toMatchObject({
      adapterName: 'premium',
      reason: 'provider-unavailable',
    });
  });

  it('closes #15: all three adapters throw (one per error class) → NoTierAvailableError with full chain', async () => {
    const stack = makeStack({
      premiumComplete: () => Promise.reject(new ProviderUnavailableError('p down')),
      cheapComplete: () => Promise.reject(new BudgetExceededError('cheap over')),
      localComplete: () => Promise.reject(new CapabilityMismatchError('no tools')),
    });
    const ordered = new DefaultPolicy().evaluate(baseRequest, stack);
    const router = new Router(ordered);

    await expect(router.complete(baseRequest)).rejects.toBeInstanceOf(NoTierAvailableError);
    const caught = await router.complete(baseRequest).catch((e: unknown) => e);
    const err = caught as NoTierAvailableError;
    expect(err.fallChain).toHaveLength(3);
    expect(err.fallChain.map((d) => d.reason)).toEqual([
      'provider-unavailable',
      'budget',
      'capability',
    ]);
    expect(err.fallChain.map((d) => d.adapterName)).toEqual(['premium', 'cheap', 'local']);
  });

  it('closes #15: untyped error mid-cascade → falls with reason "unknown"', async () => {
    const stack = makeStack({
      premiumComplete: () => Promise.reject(new TypeError('boom')),
    });
    const ordered = new DefaultPolicy().evaluate(baseRequest, stack);
    const router = new Router(ordered);

    const response = await router.complete(baseRequest);
    expect(response.tier).toBe('cheap-cloud');
    expect(response.fallChain).toHaveLength(1);
    expect(response.fallChain[0]?.reason).toBe('unknown');
    expect(response.fallChain[0]?.detail).toContain('boom');
  });
});
