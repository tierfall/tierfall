import { presets } from '../src/presets.js';

describe('OpenAI-compatible presets (issue #7 — currently failing TDD)', () => {
  it('exposes the five v0.1 presets', () => {
    expect(Object.keys(presets).sort()).toEqual([
      'cerebras',
      'deepseek',
      'groq',
      'openai',
      'openrouter',
    ]);
  });

  it('groq preset produces a valid config with default model and base URL', () => {
    const factory = presets.groq;
    expect(factory).toBeDefined();
    if (!factory) throw new Error('groq preset missing');
    const config = factory();
    expect(config.baseUrl).toContain('groq.com');
    expect(config.model).toBeTruthy();
  });
});
