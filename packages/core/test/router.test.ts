import {
  BudgetExceededError,
  CapabilityMismatchError,
  NoTierAvailableError,
  ProviderUnavailableError,
} from '../src/errors.js';
import { Router } from '../src/router.js';
import { fakeAdapter, throwingAdapter } from './helpers/adapters.js';

describe('Router (closes #2)', () => {
  it('completes via the first adapter when it succeeds', async () => {
    const router = new Router([fakeAdapter('premium', 'premium-cloud')]);
    const result = await router.complete({
      model: 'whatever',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBe('from premium');
    expect(result.tier).toBe('premium-cloud');
    expect(result.fallChain).toEqual([]);
  });

  it('closes #2: fall on ProviderUnavailableError', async () => {
    const router = new Router([
      throwingAdapter('premium', 'premium-cloud', new ProviderUnavailableError('down')),
      fakeAdapter('cheap', 'cheap-cloud'),
    ]);
    const result = await router.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBe('from cheap');
    expect(result.tier).toBe('cheap-cloud');
    expect(result.fallChain).toHaveLength(1);
    expect(result.fallChain[0]).toMatchObject({
      tier: 'premium-cloud',
      adapterName: 'premium',
      reason: 'provider-unavailable',
      detail: 'down',
    });
  });

  it('closes #2: fall on BudgetExceededError', async () => {
    const router = new Router([
      throwingAdapter('premium', 'premium-cloud', new BudgetExceededError('over budget')),
      fakeAdapter('on-device', 'on-device'),
    ]);
    const result = await router.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBe('from on-device');
    expect(result.tier).toBe('on-device');
    expect(result.fallChain).toHaveLength(1);
    expect(result.fallChain[0]?.reason).toBe('budget');
  });

  it('closes #2: fall on CapabilityMismatchError', async () => {
    const router = new Router([
      throwingAdapter('premium', 'premium-cloud', new CapabilityMismatchError('no tools')),
      fakeAdapter('cheap', 'cheap-cloud'),
    ]);
    const result = await router.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBe('from cheap');
    expect(result.fallChain[0]?.reason).toBe('capability');
  });

  it('closes #2: all adapters fail → NoTierAvailableError with full chain', async () => {
    const router = new Router([
      throwingAdapter('premium', 'premium-cloud', new ProviderUnavailableError('p down')),
      throwingAdapter('cheap', 'cheap-cloud', new BudgetExceededError('cheap over')),
      throwingAdapter('on-device', 'on-device', new CapabilityMismatchError('no tools')),
    ]);

    await expect(
      router.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(NoTierAvailableError);

    const caught = await router
      .complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(NoTierAvailableError);
    const err = caught as NoTierAvailableError;
    expect(err.fallChain).toHaveLength(3);
    expect(err.fallChain.map((d) => d.reason)).toEqual([
      'provider-unavailable',
      'budget',
      'capability',
    ]);
    expect(err.fallChain.map((d) => d.adapterName)).toEqual(['premium', 'cheap', 'on-device']);
  });

  it('closes #2: untyped error falls with reason "unknown"', async () => {
    const router = new Router([
      throwingAdapter('premium', 'premium-cloud', new TypeError('boom')),
      fakeAdapter('cheap', 'cheap-cloud'),
    ]);
    const result = await router.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.fallChain[0]?.reason).toBe('unknown');
    expect(result.fallChain[0]?.detail).toContain('boom');
  });
});
