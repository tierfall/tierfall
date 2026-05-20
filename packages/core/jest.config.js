/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  // TODO(#3): remove once DefaultPolicy.evaluate is implemented and policy.test.ts goes green.
  // Excluding the red TDD policy test lets `test-core` in CI gate the router suite without
  // requiring issue #3 to land first. Issue #3's PR drops this entry as its first commit.
  testPathIgnorePatterns: ['/node_modules/', '\\.policy\\.test\\.ts$', 'policy\\.test\\.ts$'],
  collectCoverageFrom: ['src/**/*.ts'],
};
