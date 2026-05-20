import { describe, expect, it } from '@jest/globals';
import { presets } from '../src/presets.js';

describe('OpenAI-compatible presets (closes #7)', () => {
  it('closes #7: exposes the five v0.1 presets', () => {
    expect(Object.keys(presets).sort()).toEqual([
      'cerebras',
      'deepseek',
      'groq',
      'openai',
      'openrouter',
    ]);
  });

  it('closes #7: groq() returns valid config with groq baseUrl and llama default model', () => {
    const config = presets.groq();
    expect(config.baseUrl).toContain('groq.com');
    expect(config.model).toMatch(/llama/i);
    expect(config.tier).toBe('cheap-cloud');
  });

  it('closes #7: deepseek() returns valid config with deepseek baseUrl and deepseek-chat default', () => {
    const config = presets.deepseek();
    expect(config.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(config.model).toBe('deepseek-chat');
    expect(config.tier).toBe('cheap-cloud');
  });

  it('closes #7: openai() returns valid config tier=premium-cloud', () => {
    const config = presets.openai();
    expect(config.baseUrl).toBe('https://api.openai.com/v1');
    expect(config.model).toMatch(/^gpt-/);
    expect(config.tier).toBe('premium-cloud');
  });

  it('closes #7: cerebras() returns valid config with cerebras baseUrl', () => {
    const config = presets.cerebras();
    expect(config.baseUrl).toBe('https://api.cerebras.ai/v1');
    expect(config.model).toMatch(/llama/i);
    expect(config.tier).toBe('cheap-cloud');
  });

  it('closes #7: openrouter() uses openrouter baseUrl and provider/model slug format', () => {
    const config = presets.openrouter();
    expect(config.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(config.model).toContain('/');
    expect(config.tier).toBe('cheap-cloud');
  });

  it('closes #7: top-level overrides win (model)', () => {
    const config = presets.groq({ model: 'custom-model-name' });
    expect(config.model).toBe('custom-model-name');
    expect(config.baseUrl).toBe('https://api.groq.com/openai/v1');
    expect(config.tier).toBe('cheap-cloud');
  });

  it('closes #7: capability overrides deep-merge (override one field, others preserved)', () => {
    const config = presets.groq({ capability: { contextWindowTokens: 999_999 } });
    expect(config.capability?.contextWindowTokens).toBe(999_999);
    expect(config.capability?.costPerMillionInputTokens).toBe(0.59);
    expect(config.capability?.costPerMillionOutputTokens).toBe(0.79);
  });

  it('closes #7: all presets have non-zero pricing (defeats budget policy if 0)', () => {
    const allPresets = [
      ['groq', presets.groq] as const,
      ['deepseek', presets.deepseek] as const,
      ['openai', presets.openai] as const,
      ['cerebras', presets.cerebras] as const,
      ['openrouter', presets.openrouter] as const,
    ];
    for (const [name, factory] of allPresets) {
      const config = factory();
      const inputCost = config.capability?.costPerMillionInputTokens;
      const outputCost = config.capability?.costPerMillionOutputTokens;
      if (inputCost === undefined || inputCost === null || inputCost <= 0) {
        throw new Error(`preset ${name} has zero or missing input cost`);
      }
      if (outputCost === undefined || outputCost === null || outputCost <= 0) {
        throw new Error(`preset ${name} has zero or missing output cost`);
      }
      expect(inputCost).toBeGreaterThan(0);
      expect(outputCost).toBeGreaterThan(0);
    }
  });
});
