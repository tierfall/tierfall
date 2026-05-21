import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: 'export',
  basePath: '/tierfall',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default withMDX(config);
