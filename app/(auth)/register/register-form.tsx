'use client';

import { AlertCircle, UserPlus } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Field, Input, Panel } from '@/components/ui/primitives';

import { registerAction, type ActionState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending}>
      {pending ? (
        'Creating workspace…'
      ) : (
        <>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Create workspace
        </>
      )}
    </Button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    registerAction,
    {},
  );

  return (
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
            <p className="text-xs leading-relaxed text-danger-400">{state.error}</p>
          </div>
        ) : null}

        <Field label="Your name" htmlFor="name" error={state.fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            placeholder="Alex Morgan"
          />
        </Field>

        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint="At least 10 characters, with upper case, lower case and a digit."
          error={state.fieldErrors?.password}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
          />
        </Field>

        <Field
          label="Workspace name"
          htmlFor="workspaceName"
          hint="Usually your company or team name."
          error={state.fieldErrors?.workspaceName}
        >
          <Input
            id="workspaceName"
            name="workspaceName"
            required
            placeholder="Northwind Labs"
          />
        </Field>

        <SubmitButton />
      </form>
    </Panel>
  );
}
