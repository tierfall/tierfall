import Link from 'next/link';
import type { ReactNode } from 'react';

export default function HomePage(): ReactNode {
  return (
    <main className="flex flex-1 flex-col justify-center text-center">
      <h1 className="mb-4 text-2xl font-bold">TierFall</h1>
      <p className="text-fd-muted-foreground">
        Local-first AI routing for TypeScript. <strong>Fall, never climb.</strong>
      </p>
      <p className="text-fd-muted-foreground">
        Read the{' '}
        <Link href="/docs" className="text-fd-foreground font-semibold underline">
          documentation
        </Link>
        .
      </p>
    </main>
  );
}
