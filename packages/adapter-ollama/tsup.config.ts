import { defineConfig } from 'tsup';

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
