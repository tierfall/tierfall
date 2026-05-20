import './global.css';
import 'fumadocs-ui/style.css';
import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';

export const metadata = {
  title: 'TierFall',
  description: 'Local-first AI routing for TypeScript. Fall, never climb.',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
