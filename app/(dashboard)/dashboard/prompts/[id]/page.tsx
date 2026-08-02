import { ArrowLeft, Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import { Badge, Button, Panel, PanelHeader } from '@/components/ui/primitives';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Prompt' };

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { workspaceId } = await requireWorkspace();
  const { id } = await params;

  const prompt = await prisma.prompt.findFirst({
    where: { id, workspaceId },
    include: { versions: { orderBy: { version: 'desc' } } },
  });

  if (!prompt) notFound();

  return (
    <>
      <PageHeader
        title={prompt.name}
        description={prompt.description ?? undefined}
        actions={
          <Link href="/dashboard/prompts">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              All prompts
            </Button>
          </Link>
        }
      />

      <PageBody>
        <p className="text-xs leading-relaxed text-ink-400">
          Every version below is retained. Rolling back moves the active pointer rather
          than editing history, so a request served last month can still be explained
          against the exact text that produced it.
        </p>

        <div className="space-y-4">
          {prompt.versions.map((version) => {
            const isActive = version.id === prompt.activeVersionId;

            return (
              <Panel
                key={version.id}
                className={isActive ? 'border-primary-500/40' : undefined}
              >
                <PanelHeader
                  title={
                    <span className="flex items-center gap-2">
                      Version {version.version}
                      {isActive ? (
                        <Badge tone="primary">
                          <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                          active
                        </Badge>
                      ) : null}
                    </span>
                  }
                  description={version.changeNote ?? undefined}
                  actions={
                    <span className="text-[11px] text-ink-600">
                      {formatDateTime(version.createdAt)}
                    </span>
                  }
                />

                <div className="space-y-3 px-5 py-4">
                  {version.variables.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] tracking-wide text-ink-600 uppercase">
                        Variables
                      </span>
                      {version.variables.map((variable) => (
                        <Badge key={variable} tone="accent">
                          {`{{${variable}}}`}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  <div>
                    <h4 className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
                      System prompt
                    </h4>
                    <pre className="mt-1.5 overflow-x-auto rounded border border-base-700 bg-base-850 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-200">
                      {version.systemPrompt || '(none)'}
                    </pre>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
                      User template
                    </h4>
                    <pre className="mt-1.5 overflow-x-auto rounded border border-base-700 bg-base-850 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-200">
                      {version.userTemplate}
                    </pre>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
