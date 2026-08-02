import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';

import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create a workspace' };

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
          Create a workspace
        </h1>
        <p className="mt-2 text-sm text-ink-400">
          You will be the owner. Applications, providers and policies all live inside the
          workspace.
        </p>
      </div>

      <RegisterForm />

      <p className="text-center text-xs text-ink-600">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-primary-400 underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
