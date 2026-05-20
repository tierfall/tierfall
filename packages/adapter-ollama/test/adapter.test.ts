import { OllamaAdapter } from '../src/adapter.js';

describe('OllamaAdapter (issue #5 — currently failing TDD)', () => {
  it('completes a basic request', async () => {
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b', baseUrl: 'http://localhost:11434' });
    const result = await adapter.complete({
      model: 'llama3.2:3b',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBeTruthy();
  });
});
