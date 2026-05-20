import { buildAdapters } from './build-adapters.js';
import { printTopBanner, printRunSummary } from './banner.js';
import { runBasicScenario } from './scenarios/basic.js';
import { runBudgetFallScenario } from './scenarios/budget-fall.js';
import { runCapabilityScenario } from './scenarios/capability.js';
import { runProviderDownScenario } from './scenarios/provider-down.js';

async function main(): Promise<void> {
  const { adapters, status } = buildAdapters(process.env);
  printTopBanner(status);

  const results: boolean[] = [];
  results.push(await runBasicScenario(adapters));
  results.push(await runBudgetFallScenario(adapters));
  results.push(await runCapabilityScenario(adapters));
  results.push(await runProviderDownScenario(adapters));

  const passed = results.filter((r) => r).length;
  printRunSummary(passed, results.length);

  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
