import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  target: 'node24',
  platform: 'node',
  clean: true,
  sourcemap: true,
  tsconfig: './tsconfig.build.json',
});
