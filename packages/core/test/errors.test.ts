import { formatFallChain, type FallDiagnostic } from '../src/index.js';

describe('formatFallChain (closes #4)', () => {
  it('closes #4: empty chain returns empty string', () => {
    expect(formatFallChain([])).toBe('');
  });

  it('closes #4: single-fall chain returns one indented line with correct shape', () => {
    const chain: readonly FallDiagnostic[] = [
      {
        tier: 'premium-cloud',
        adapterName: 'premium',
        reason: 'budget',
        detail: 'over budget',
      },
    ];
    expect(formatFallChain(chain)).toBe('  1. premium-cloud / premium — budget: over budget');
  });

  it('closes #4: 3-deep chain returns three lines in attempt order, no trailing newline', () => {
    const chain: readonly FallDiagnostic[] = [
      {
        tier: 'premium-cloud',
        adapterName: 'premium',
        reason: 'provider-unavailable',
        detail: 'p down',
      },
      {
        tier: 'cheap-cloud',
        adapterName: 'cheap',
        reason: 'budget',
        detail: 'cheap over',
      },
      {
        tier: 'on-device',
        adapterName: 'local',
        reason: 'capability',
        detail: 'no tools',
      },
    ];
    const result = formatFallChain(chain);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('  1. premium-cloud / premium — provider-unavailable: p down');
    expect(lines[1]).toBe('  2. cheap-cloud / cheap — budget: cheap over');
    expect(lines[2]).toBe('  3. on-device / local — capability: no tools');
    expect(result.endsWith('\n')).toBe(false);
  });

  it('closes #4: every reason value renders verbatim', () => {
    const reasons: FallDiagnostic['reason'][] = [
      'budget',
      'capability',
      'provider-unavailable',
      'unknown',
    ];
    for (const reason of reasons) {
      const out = formatFallChain([{ tier: 'cheap-cloud', adapterName: 'x', reason, detail: 'd' }]);
      expect(out).toBe(`  1. cheap-cloud / x — ${reason}: d`);
    }
  });
});
