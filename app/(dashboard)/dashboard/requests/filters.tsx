'use client';

import { X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button, Panel, Select } from '@/components/ui/primitives';
import { ERROR_LABELS } from '@/components/dashboard/status';

/**
 * Request filters.
 *
 * State lives in the URL rather than in component state, so a filtered view can
 * be linked, bookmarked and shared — which is what you want when handing a
 * colleague a specific failure to look at.
 */
export function RequestFilters({
  applications,
}: {
  applications: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasFilters = [...searchParams.keys()].length > 0;

  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-36 flex-1">
          <label
            htmlFor="filter-status"
            className="mb-1.5 block text-[11px] font-medium text-ink-400"
          >
            Status
          </label>
          <Select
            id="filter-status"
            value={searchParams.get('status') ?? ''}
            onChange={(event) => update('status', event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="FAILED">Failed</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </div>

        <div className="min-w-36 flex-1">
          <label
            htmlFor="filter-category"
            className="mb-1.5 block text-[11px] font-medium text-ink-400"
          >
            Error category
          </label>
          <Select
            id="filter-category"
            value={searchParams.get('category') ?? ''}
            onChange={(event) => update('category', event.target.value)}
          >
            <option value="">Any</option>
            {Object.entries(ERROR_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-36 flex-1">
          <label
            htmlFor="filter-application"
            className="mb-1.5 block text-[11px] font-medium text-ink-400"
          >
            Application
          </label>
          <Select
            id="filter-application"
            value={searchParams.get('application') ?? ''}
            onChange={(event) => update('application', event.target.value)}
          >
            <option value="">All applications</option>
            {applications.map((application) => (
              <option key={application.id} value={application.id}>
                {application.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-36 flex-1">
          <label
            htmlFor="filter-environment"
            className="mb-1.5 block text-[11px] font-medium text-ink-400"
          >
            Environment
          </label>
          <Select
            id="filter-environment"
            value={searchParams.get('environment') ?? ''}
            onChange={(event) => update('environment', event.target.value)}
          >
            <option value="">Both</option>
            <option value="DEVELOPMENT">Development</option>
            <option value="PRODUCTION">Production</option>
          </Select>
        </div>

        <div className="min-w-36 flex-1">
          <label
            htmlFor="filter-fallback"
            className="mb-1.5 block text-[11px] font-medium text-ink-400"
          >
            Fallback
          </label>
          <Select
            id="filter-fallback"
            value={searchParams.get('fallback') ?? ''}
            onChange={(event) => update('fallback', event.target.value)}
          >
            <option value="">Any</option>
            <option value="true">Fallback used</option>
          </Select>
        </div>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(pathname)}
            className="mb-0.5"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
