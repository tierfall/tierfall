import { Router } from '../src/router.js';
import { fakeAdapter } from './helpers/adapters.js';

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
});
