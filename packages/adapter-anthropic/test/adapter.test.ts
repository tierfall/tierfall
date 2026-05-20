import { AnthropicAdapter } from '../src/adapter.js';

describe('AnthropicAdapter (issue #8 — currently failing TDD)', () => {
  it('completes a basic request', async () => {
    const adapter = new AnthropicAdapter({
      model: 'claude-3-5-sonnet-latest',
      apiKey: 'sk-ant-test',
    });
    const result = await adapter.complete({
      model: 'claude-3-5-sonnet-latest',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBeTruthy();
  });
});
