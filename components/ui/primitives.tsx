import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Accessible UI primitives, written for this project.
 *
 * Deliberately small and unabstracted: every element renders real semantic HTML
 * so keyboard navigation, focus order and screen-reader output are correct by
 * construction rather than patched on with ARIA.
 */

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

export function Panel({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      className={cn(
        'rounded-xl border border-base-700 bg-base-900/70 shadow-lg shadow-black/20',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  as: Heading = 'h2',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-base-700 px-5 py-4">
      <div className="min-w-0">
        <Heading className="text-sm font-semibold tracking-tight text-ink-50">
          {title}
        </Heading>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-ink-400">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

export function PanelBody({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('px-5 py-4', className)} {...props}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-500 text-base-950 hover:bg-primary-400 font-semibold disabled:hover:bg-primary-500',
  secondary:
    'bg-base-700 text-ink-50 hover:bg-base-600 border border-base-600 disabled:hover:bg-base-700',
  ghost:
    'bg-transparent text-ink-200 hover:bg-base-800 hover:text-ink-50 disabled:hover:bg-transparent',
  danger:
    'bg-danger-600 text-white hover:bg-danger-400 font-semibold disabled:hover:bg-danger-600',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                       */
/* -------------------------------------------------------------------------- */

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-base-700 text-ink-200 border-base-600',
  primary: 'bg-primary-500/12 text-primary-300 border-primary-500/30',
  accent: 'bg-accent-500/12 text-accent-300 border-accent-500/30',
  success: 'bg-success-400/12 text-success-400 border-success-400/30',
  warning: 'bg-warning-400/12 text-warning-400 border-warning-400/30',
  danger: 'bg-danger-400/12 text-danger-400 border-danger-400/30',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat                                                                        */
/* -------------------------------------------------------------------------- */

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: BadgeTone;
}) {
  const valueTone: Record<BadgeTone, string> = {
    neutral: 'text-ink-50',
    primary: 'text-primary-300',
    accent: 'text-accent-300',
    success: 'text-success-400',
    warning: 'text-warning-400',
    danger: 'text-danger-400',
  };

  return (
    <div className="rounded-xl border border-base-700 bg-base-900/70 px-4 py-3.5">
      <dt className="text-[11px] font-medium tracking-wide text-ink-400 uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1.5 text-2xl font-semibold tabular-nums',
          valueTone[tone],
        )}
      >
        {value}
      </dd>
      {hint ? <p className="mt-1 text-[11px] text-ink-600">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field                                                                       */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-ink-200"
      >
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={hintId} className="text-[11px] text-ink-600">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-[11px] text-danger-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_CLASS =
  'w-full rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-sm text-ink-50 ' +
  'placeholder:text-ink-600 transition-colors hover:border-base-500 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export function Input({ className, ...props }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cn(CONTROL_CLASS, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: ComponentPropsWithoutRef<'textarea'>) {
  return (
    <textarea
      className={cn(CONTROL_CLASS, 'resize-y font-mono text-xs', className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'select'>) {
  return (
    <select className={cn(CONTROL_CLASS, 'pr-8', className)} {...props}>
      {children}
    </select>
  );
}

/* -------------------------------------------------------------------------- */
/* Table                                                                       */
/* -------------------------------------------------------------------------- */

export function Table({
  caption,
  head,
  children,
}: {
  caption: string;
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    // Wide tables scroll inside their own container so the page never does.
    <div className="overflow-x-auto">
      <table className="w-full min-w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-base-700 text-left">{head}</tr>
        </thead>
        <tbody className="divide-y divide-base-800">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase whitespace-nowrap',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'td'>) {
  return (
    <td className={cn('px-3 py-2.5 align-middle text-ink-200', className)} {...props}>
      {children}
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                 */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-base-700 px-6 py-12 text-center">
      <h3 className="text-sm font-semibold text-ink-200">{title}</h3>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-ink-400">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Demo data indicator                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Marks figures derived from seeded demonstration data.
 *
 * Present wherever numbers are shown, because an operations dashboard that
 * looks real while showing invented traffic would be misleading.
 */
export function DemoDataNotice({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-base-600 bg-base-800/80 px-2 py-0.5 text-[11px] text-ink-400',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-warning-400"
      />
      Demo data
    </span>
  );
}
