#!/usr/bin/env tsx
/**
 * Scaffolds a new TierFall adapter package at `packages/adapter-<name>`.
 *
 * Templates mirror the canonical structure of `packages/adapter-ollama/`
 * (Commit 5) and `packages/core/` (Commit 4) — see plan §4.2.9.11.
 *
 * Usage:
 *   pnpm scaffold:adapter <name>     # lowercase, hyphens only
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function toPascalCase(input: string): string {
  return input
    .split('-')
    .map((segment) => {
      if (segment.length === 0) {
        fail(`Invalid adapter name segment: ${input}`);
      }
      const first = segment.charAt(0).toUpperCase();
      const rest = segment.slice(1);
      return `${first}${rest}`;
    })
    .join('');
}

const rawName = process.argv[2];
if (typeof rawName !== 'string' || !/^[a-z][a-z0-9-]*$/.test(rawName)) {
  fail('Usage: pnpm scaffold:adapter <name>  (lowercase, hyphens only)');
}

const name: string = rawName;
const Name: string = toPascalCase(name);

const root = join(process.cwd(), 'packages', `adapter-${name}`);
if (existsSync(root)) {
  fail(`packages/adapter-${name} already exists`);
}

mkdirSync(join(root, 'src'), { recursive: true });
mkdirSync(join(root, 'test'), { recursive: true });

interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly license: string;
  readonly repository: {
    readonly type: string;
    readonly url: string;
    readonly directory: string;
  };
  readonly type: string;
  readonly main: string;
  readonly module: string;
  readonly types: string;
  readonly exports: Record<string, unknown>;
  readonly files: readonly string[];
  readonly scripts: Record<string, string>;
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
  readonly publishConfig: { readonly access: string };
}

const packageJson: PackageJson = {
  name: `@tierfall/adapter-${name}`,
  version: '0.0.0',
  description: `TierFall ${Name} adapter`,
  license: 'Apache-2.0',
  repository: {
    type: 'git',
    url: 'https://github.com/tierfall/tierfall.git',
    directory: `packages/adapter-${name}`,
  },
  type: 'module',
  main: './dist/index.cjs',
  module: './dist/index.js',
  types: './dist/index.d.ts',
  exports: {
    '.': {
      import: {
        types: './dist/index.d.ts',
        default: './dist/index.js',
      },
      require: {
        types: './dist/index.d.cts',
        default: './dist/index.cjs',
      },
    },
    './package.json': './package.json',
  },
  files: ['dist', 'README.md', 'LICENSE'],
  scripts: {
    build: 'tsup',
    test: 'node --experimental-vm-modules ../../node_modules/jest/bin/jest.js',
    lint: 'eslint --max-warnings=0 --quiet src test',
    typecheck: 'tsc --noEmit --pretty false',
  },
  dependencies: {
    '@tierfall/core': 'workspace:*',
  },
  devDependencies: {
    tsup: '8.5.1',
    typescript: '6.0.3',
    jest: '29.7.0',
    'ts-jest': '29.4.10',
  },
  publishConfig: {
    access: 'public',
  },
};

writeFileSync(join(root, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);

const tsconfigJson = {
  extends: '../../tsconfig.base.json',
  compilerOptions: {
    outDir: './dist',
    rootDir: '.',
    composite: true,
    ignoreDeprecations: '6.0',
    types: ['jest', 'node'],
  },
  include: ['src/**/*.ts', 'test/**/*.ts', 'tsup.config.ts'],
  exclude: ['node_modules', 'dist', 'coverage'],
};
writeFileSync(join(root, 'tsconfig.json'), `${JSON.stringify(tsconfigJson, null, 2)}\n`);

const tsconfigBuildJson = {
  extends: '../../tsconfig.base.json',
  compilerOptions: {
    outDir: './dist',
    rootDir: './src',
    ignoreDeprecations: '6.0',
    noEmit: false,
  },
  include: ['src/**/*.ts'],
};
writeFileSync(join(root, 'tsconfig.build.json'), `${JSON.stringify(tsconfigBuildJson, null, 2)}\n`);

const tsupConfig = `import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: { resolve: true, entry: 'src/index.ts' },
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  tsconfig: './tsconfig.build.json',
});
`;
writeFileSync(join(root, 'tsup.config.ts'), tsupConfig);

const projectJson = {
  name: `adapter-${name}`,
  $schema: '../../node_modules/nx/schemas/project-schema.json',
  projectType: 'library',
  sourceRoot: `packages/adapter-${name}/src`,
  targets: {
    build: { executor: 'nx:run-script', options: { script: 'build' } },
    test: { executor: 'nx:run-script', options: { script: 'test' } },
    lint: { executor: 'nx:run-script', options: { script: 'lint' } },
    typecheck: { executor: 'nx:run-script', options: { script: 'typecheck' } },
  },
};
writeFileSync(join(root, 'project.json'), `${JSON.stringify(projectJson, null, 2)}\n`);

const jestConfig = `/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\\\.{1,2}/.*)\\\\.js$': '$1' },
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
};
`;
writeFileSync(join(root, 'jest.config.js'), jestConfig);

const indexTs = `export { ${Name}Adapter, type ${Name}AdapterConfig } from './adapter.js';
`;
writeFileSync(join(root, 'src', 'index.ts'), indexTs);

const adapterTs = `import type { Adapter, AdapterCapability, LLMRequest, LLMResponse, Tier } from '@tierfall/core';

export interface ${Name}AdapterConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly capability?: Partial<AdapterCapability>;
}

/**
 * Skeleton ${Name} adapter — implementation pending.
 *
 * Edit \`tier\`, \`capability\`, and the \`complete\` body to match the provider
 * being implemented. The default tier is \`on-device\`; switch to
 * \`self-hosted-edge\`, \`cheap-cloud\`, or \`premium-cloud\` as appropriate.
 */
export class ${Name}Adapter implements Adapter {
  readonly name = '${name}';
  readonly tier: Tier;
  readonly capability: AdapterCapability;

  constructor(config: ${Name}AdapterConfig) {
    this.tier = 'on-device';
    this.capability = {
      contextWindowTokens: 8192,
      supportsTools: false,
      supportsStreaming: false,
      supportsStructuredOutput: false,
      costPerMillionInputTokens: null,
      costPerMillionOutputTokens: null,
      ...config.capability,
    };
  }

  complete(_request: LLMRequest): Promise<LLMResponse> {
    return Promise.reject(new Error('${Name}Adapter.complete is not yet implemented'));
  }
}
`;
writeFileSync(join(root, 'src', 'adapter.ts'), adapterTs);

const adapterTest = `import { ${Name}Adapter } from '../src/adapter.js';

describe('${Name}Adapter (scaffold — currently failing TDD)', () => {
  it('completes a basic request', async () => {
    const adapter = new ${Name}Adapter({ model: 'replace-me' });
    const result = await adapter.complete({
      model: 'replace-me',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBeTruthy();
  });
});
`;
writeFileSync(join(root, 'test', 'adapter.test.ts'), adapterTest);

const claudeMd = `# packages/adapter-${name} — Claude context

\`@tierfall/adapter-${name}\` is a scaffold-generated TierFall adapter.

## Key contracts

- \`${Name}Adapter\` implements \`Adapter\` from \`@tierfall/core\`.
- Tier defaults to \`on-device\` — change in \`src/adapter.ts\` to match the provider.
- \`capability\` is a sensible default; edit it to match the provider's real limits.

## Implementation status

Skeleton: \`complete\` throws "not yet implemented". A failing TDD test lives in
\`test/adapter.test.ts\` — make it pass by implementing \`complete\`, not by editing
the test. Track the real implementation in a GitHub issue.

## When changing this package

Run \`pnpm --filter @tierfall/adapter-${name} test\`. Keep the adapter surface
symmetric with the other \`packages/adapter-*\` (same exported names, same shape).
`;
writeFileSync(join(root, 'CLAUDE.md'), claudeMd);

const readmeMd = `# @tierfall/adapter-${name}

[TierFall](https://github.com/tierfall/tierfall) adapter for ${Name}.

## Install

\`\`\`bash
pnpm add @tierfall/core @tierfall/adapter-${name}
\`\`\`

## Usage

> Implementation pending. The skeleton compiles and exposes the configuration
> surface; calling \`complete()\` throws "not yet implemented".

\`\`\`ts
import { ${Name}Adapter } from '@tierfall/adapter-${name}';

const adapter = new ${Name}Adapter({ model: 'replace-me' });
\`\`\`

## License

Apache-2.0
`;
writeFileSync(join(root, 'README.md'), readmeMd);

console.log(
  `Scaffolded packages/adapter-${name}. Next: edit tier, capability, README — and open issue/PR.`,
);
