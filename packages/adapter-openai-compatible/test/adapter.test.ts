import { OpenAICompatibleAdapter } from '../src/adapter.js';

describe('OpenAICompatibleAdapter (issue #6 — currently failing TDD)', () => {
  it('completes a basic request', async () => {
    const adapter = new OpenAICompatibleAdapter({
      model: 'test',
      baseUrl: 'http://localhost',
      apiKey: 'sk-test',
    });
    const result = await adapter.complete({
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBeTruthy();
  });
});
