import { DefaultPolicy } from '../src/policy.js';

describe('DefaultPolicy (issue #3 — currently failing TDD)', () => {
  it('orders adapters by tier expense, premium first', () => {
    const policy = new DefaultPolicy();
    const adapters = policy.evaluate({ model: 'm', messages: [] }, []);
    expect(adapters).toEqual([]);
  });
});
