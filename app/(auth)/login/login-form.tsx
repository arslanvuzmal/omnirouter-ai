'use client';

import { AlertCircle, LogIn } from 'lucide-react';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Field, Input, Panel } from '@/components/ui/primitives';

import { loginAction, type ActionState } from '../actions';

/**
 * Demo accounts offered on the public deployment.
 *
 * These are surfaced in the UI only when DEMO_MODE is on, and they exist purely
 * to let a visitor see each role's restrictions without registering.
 */
const DEMO_ACCOUNTS = [
  { email: 'owner@omnirouter.demo', role: 'Owner', note: 'Full access' },
  { email: 'admin@omnirouter.demo', role: 'Admin', note: 'No workspace deletion' },
  {
    email: 'developer@omnirouter.demo',
    role: 'Developer',
    note: 'Playground and prompts',
  },
  { email: 'viewer@omnirouter.demo', role: 'Viewer', note: 'Read-only' },
];

const DEMO_PASSWORD = 'OmniDemo!2026';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending}>
      {pending ? (
        'Signing in…'
      ) : (
        <>
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Sign in
        </>
      )}
    </Button>
  );
}

export function LoginForm({ demoMode }: { demoMode: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(loginAction, {});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="space-y-4">
      <Panel className="p-6">
        <form action={formAction} className="space-y-4">
          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-danger-400/30 bg-danger-400/10 px-3.5 py-3"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-danger-400"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-danger-400">
                {state.error}
              </p>
            </div>
          ) : null}

          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••"
            />
          </Field>

          <SubmitButton />
        </form>
      </Panel>

      {demoMode ? (
        <Panel className="p-5">
          <h2 className="text-xs font-semibold text-ink-50">Demo accounts</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
            Each role sees a different subset of the product. Selecting one fills
            the form; permissions are enforced on the server, not by hiding
            buttons.
          </p>

          <ul className="mt-3 space-y-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(DEMO_PASSWORD);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-base-700 bg-base-850 px-3 py-2 text-left transition-colors hover:border-base-500 hover:bg-base-800"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-ink-50">
                      {account.role}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-ink-600">
                      {account.email}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-ink-400">
                    {account.note}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-3 font-mono text-[10px] text-ink-600">
            Password: {DEMO_PASSWORD}
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
