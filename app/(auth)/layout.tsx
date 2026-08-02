import Link from 'next/link';

import { OmniRouterWordmark } from '@/components/brand/wordmark';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="surface-glow relative flex min-h-screen flex-col">
      <div className="surface-grid absolute inset-0 opacity-30" aria-hidden="true" />

      <header className="relative px-5 py-6">
        <Link href="/" aria-label="OmniRouter home">
          <OmniRouterWordmark />
        </Link>
      </header>

      <main
        id="main"
        className="relative flex flex-1 items-start justify-center px-5 pt-4 pb-16"
      >
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
