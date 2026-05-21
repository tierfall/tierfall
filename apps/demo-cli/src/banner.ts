import type { FallDiagnostic, LLMResponse } from '@tierfall/core';
import { formatFallChain } from '@tierfall/core';

const SEPARATOR = '='.repeat(60);

export function printTopBanner(adapterStatus: readonly AdapterStatus[]): void {
  console.log(SEPARATOR);
  console.log('TierFall v0.1 — Fall-never-climb demo');
  console.log(SEPARATOR);
  console.log('');
  console.log('Detected adapters:');
  for (const row of adapterStatus) {
    const padName = row.tier.padEnd(15);
    const padImpl = (row.impl ?? 'skipped').padEnd(26);
    console.log(`  ${padName}: ${padImpl}${row.note}`);
  }
  console.log('');
}

export function printScenarioHeader(
  num: number,
  name: string,
  setup: string,
  expected: string,
): void {
  console.log(SEPARATOR);
  console.log(`Scenario ${String(num)}: ${name}`);
  console.log(SEPARATOR);
  console.log(`Setup:    ${setup}`);
  console.log(`Expected: ${expected}`);
  console.log('');
}

export function printSuccess(response: LLMResponse, note?: string): void {
  const fallChain =
    response.fallChain.length === 0
      ? (note ?? '(empty)')
      : `\n${formatFallChain(response.fallChain)}`;
  console.log(
    `✓ tier=${response.tier}  text="${truncate(response.text, 80)}"  fallChain=${fallChain}`,
  );
  console.log('');
}

export function printExpectedThrow(fallChain: readonly FallDiagnostic[]): void {
  console.log(`✓ threw NoTierAvailableError as expected`);
  console.log(`Fall chain:`);
  console.log(formatFallChain(fallChain));
  console.log('');
}

export function printFailure(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.log(`✗ FAILED: ${message}`);
  console.log('');
}

export function printRunSummary(passed: number, total: number): void {
  console.log(SEPARATOR);
  console.log(`Demo complete: ${String(passed)}/${String(total)} scenarios passed`);
  console.log(SEPARATOR);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export interface AdapterStatus {
  readonly tier: string;
  readonly impl: string | undefined;
  readonly note: string;
}
