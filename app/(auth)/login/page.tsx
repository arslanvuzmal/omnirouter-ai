import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';
import { isDemoMode } from '@/lib/env';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  // An already-signed-in visitor has no reason to see this form.
  const session = await getSession();
  if (session) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-ink-400">
          Access your workspace, routing policies and request traces.
        </p>
      </div>

      <LoginForm demoMode={isDemoMode()} />

      <p className="text-center text-xs text-ink-600">
        No account?{' '}
        <Link
          href="/register"
          className="text-primary-400 underline-offset-4 hover:underline"
        >
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
