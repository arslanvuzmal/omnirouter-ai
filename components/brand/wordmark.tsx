import { cn } from '@/lib/utils';

/**
 * OmniRouter wordmark.
 *
 * The glyph is three inbound paths converging on a single node and one path
 * leaving it — the product's thesis rendered literally: many providers, one
 * control plane. Drawn as inline SVG so it needs no external asset and inherits
 * the surrounding colour.
 */
export function OmniRouterMark({
  className,
  title = 'OmniRouter',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label={title}
      className={cn('h-7 w-7', className)}
    >
      {/* Inbound paths */}
      <path
        d="M4 8h6.5a4 4 0 0 1 4 4v0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M4 16h7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M4 24h6.5a4 4 0 0 0 4-4v0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* The control plane */}
      <circle cx="16" cy="16" r="4.25" stroke="currentColor" strokeWidth="2" />
      {/* Outbound path */}
      <path d="M20.5 16H28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="28" cy="16" r="1.75" fill="currentColor" />
    </svg>
  );
}

export function OmniRouterWordmark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <OmniRouterMark className="h-7 w-7 text-primary-400" />
      {!compact ? (
        <span className="text-[15px] font-semibold tracking-tight text-ink-50">
          Omni<span className="text-primary-400">Router</span>
        </span>
      ) : null}
    </span>
  );
}
