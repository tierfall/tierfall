export default {
  '*.{ts,tsx,mjs,cjs,js}': ['eslint --max-warnings=0 --no-warn-ignored', 'prettier --check'],
  '*.{json,md,mdx,yml,yaml,css}': ['prettier --check'],
};
