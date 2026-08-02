import 'dotenv/config';

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { prisma } from '@/lib/database/client';
import type { RouteExplanation } from '@/lib/ai/routing/types';
import type { TraceStage } from '@/lib/ai/gateway';

/**
 * Exports OmniRouter data into an Obsidian vault as markdown.
 *
 * Runs locally, because Obsidian is a local markdown application — the deployed
 * application has no access to a vault on your machine. This script reads the
 * database directly (local or Neon, whichever DATABASE_URL points at) and
 * writes notes into a single dedicated folder inside the vault.
 *
 * Usage:
 *   npm run export:obsidian -- --vault "D:\\Vault"
 *   npm run export:obsidian -- --vault "D:\\Vault" --limit 500
 *   npm run export:obsidian -- --vault "D:\\Vault" --only docs
 *
 * Safety:
 *   - Writes only inside <vault>/OmniRouter. Nothing outside that folder is
 *     touched, so your own notes cannot be overwritten.
 *   - Refuses to run if the vault path does not exist.
 *   - Refuses to clean a target folder that contains files it did not write.
 *   - Never writes a credential: API keys appear as their display prefix only,
 *     and connection strings are never read into a note.
 */

interface Options {
  vault: string;
  limit: number;
  only: 'all' | 'requests' | 'docs' | 'sessions' | 'analytics';
}

function parseArgs(argv: string[]): Options {
  const options: Options = { vault: '', limit: 300, only: 'all' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--vault') options.vault = argv[++i] ?? '';
    else if (arg === '--limit') options.limit = Number(argv[++i] ?? '300');
    else if (arg === '--only') options.only = (argv[++i] ?? 'all') as Options['only'];
  }

  return options;
}

/** Windows forbids \ / : * ? " < > | in filenames; Obsidian also dislikes #^[]|. */
function safeName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|#^[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function yamlString(value: string): string {
  // Quote and escape so a colon or quote in a value cannot break frontmatter.
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function frontmatter(fields: Record<string, string | number | boolean | null>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => (typeof v === 'string' ? `${k}: ${yamlString(v)}` : `${k}: ${v}`));
  return `---\n${lines.join('\n')}\n---\n`;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A marker written into every generated note so cleanup can identify its own output. */
const MARKER = '<!-- generated-by: omnirouter-export -->';

async function writeNote(path: string, body: string): Promise<void> {
  await writeFile(path, `${body.trimEnd()}\n\n${MARKER}\n`, 'utf8');
}

/**
 * Removes previously generated notes from a folder, but stops if it finds a
 * file it did not write — a hand-edited note must never be silently destroyed.
 */
async function cleanGenerated(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;

  const entries = await readdir(dir, { withFileTypes: true });
  let removed = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const full = join(dir, entry.name);
    const content = await readFile(full, 'utf8');

    if (!content.includes(MARKER)) {
      throw new Error(
        `Refusing to clean ${dir}: "${entry.name}" was not written by this export. ` +
          `Move or delete it manually if you want it replaced.`,
      );
    }

    await rm(full);
    removed += 1;
  }

  return removed;
}

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

async function exportRequests(
  root: string,
  limit: number,
  sourceFilter: string[] | null,
  folder: string,
): Promise<number> {
  const dir = join(root, folder);
  await mkdir(dir, { recursive: true });
  await cleanGenerated(dir);

  const requests = await prisma.request.findMany({
    where: sourceFilter ? { source: { in: sourceFilter } } : {},
    include: {
      attempts: { orderBy: { sequence: 'asc' } },
      application: { select: { name: true } },
      environment: { select: { type: true } },
      policy: { select: { name: true, strategy: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  for (const request of requests) {
    const explanation = request.routeExplanation as RouteExplanation | null;
    const stages = (request.traceStages as TraceStage[] | null) ?? [];
    const shortId = request.correlationId.slice(0, 8);

    const lines: string[] = [];

    lines.push(
      frontmatter({
        type: 'omnirouter-request',
        correlation_id: request.correlationId,
        date: request.createdAt.toISOString(),
        status: request.status,
        application: request.application.name,
        environment: request.environment.type,
        policy: request.policy?.name ?? null,
        strategy: explanation?.strategy ?? null,
        model: request.resolvedModel ?? null,
        fallback_used: request.fallbackUsed,
        attempts: request.attemptCount,
        input_tokens: request.inputTokens,
        output_tokens: request.outputTokens,
        estimated_cost: Number(request.estimatedCost),
        latency_ms: request.totalLatencyMs,
        error_category: request.errorCategory ?? null,
        source: request.source,
      }),
    );

    lines.push(`# Request ${shortId}`);
    lines.push('');
    // fallbackUsed only means another target was tried — not that it worked.
    // Saying "recovered" on a failed request would misreport the outcome.
    const fallbackNote = request.fallbackUsed
      ? request.status === 'SUCCEEDED'
        ? ' · recovered via fallback'
        : ' · fallback attempted, all targets failed'
      : '';

    lines.push(
      `**${request.status}**${fallbackNote}` +
        ` · ${request.application.name} · ${request.environment.type.toLowerCase()}` +
        ` · ${request.totalLatencyMs} ms`,
    );
    lines.push('');

    if (request.errorMessage) {
      lines.push(`> [!warning] ${request.errorCategory}`);
      lines.push(`> ${request.errorMessage}`);
      lines.push('');
    }

    // Routing decision
    if (explanation) {
      lines.push('## Routing decision');
      lines.push('');
      lines.push(`Strategy: **${explanation.strategy}** via ${explanation.policyName}`);
      lines.push('');
      lines.push(explanation.reason);
      lines.push('');

      if (explanation.scoreBreakdown.length > 0) {
        lines.push('### Score breakdown');
        lines.push('');
        lines.push('| Model | Score | Factors |');
        lines.push('| --- | ---: | --- |');
        for (const entry of explanation.scoreBreakdown) {
          const factors = entry.components
            .map((c) => `${c.factor} ${c.contribution.toFixed(3)}`)
            .join(', ');
          lines.push(
            `| \`${entry.modelLabel}\` | ${entry.score.toFixed(3)} | ${factors} |`,
          );
        }
        lines.push('');
      }

      if (explanation.rejectedCandidates.length > 0) {
        lines.push('### Candidates not selected');
        lines.push('');
        for (const candidate of explanation.rejectedCandidates) {
          lines.push(
            `- \`${candidate.modelLabel}\` — *${candidate.reason.replace(/_/g, ' ')}* — ${candidate.detail}`,
          );
        }
        lines.push('');
      }

      if (explanation.fallbackOrder.length > 0) {
        lines.push(
          `**Fallback order:** ${explanation.fallbackOrder.map((m) => `\`${m}\``).join(' → ')}`,
        );
        lines.push('');
      }
    }

    // Attempts
    if (request.attempts.length > 0) {
      lines.push('## Provider attempts');
      lines.push('');
      lines.push('| # | Model | Provider | Status | Latency | Reason |');
      lines.push('| ---: | --- | --- | --- | ---: | --- |');
      for (const attempt of request.attempts) {
        lines.push(
          `| ${attempt.sequence} | \`${attempt.modelLabel}\` | ${attempt.providerKind} |` +
            ` ${attempt.status.toLowerCase().replace('_', ' ')}${attempt.errorCategory ? ` (${attempt.errorCategory})` : ''} |` +
            ` ${attempt.latencyMs} ms | ${attempt.reason ?? ''} |`,
        );
      }
      lines.push('');
    }

    // Lifecycle
    if (stages.length > 0) {
      lines.push('## Lifecycle');
      lines.push('');
      for (const stage of stages) {
        const icon =
          stage.status === 'ok'
            ? '✓'
            : stage.status === 'warn'
              ? '!'
              : stage.status === 'error'
                ? '✗'
                : '–';
        lines.push(
          `- \`${icon}\` **${stage.label}** (+${stage.durationMs} ms) — ${stage.detail}`,
        );
      }
      lines.push('');
    }

    // Content, only if the workspace actually retained it.
    if (request.promptPreview || request.responsePreview) {
      lines.push('## Content');
      lines.push('');
      if (request.promptPreview) {
        lines.push('**Prompt**');
        lines.push('');
        lines.push('```text');
        lines.push(request.promptPreview);
        lines.push('```');
        lines.push('');
      }
      if (request.responsePreview) {
        lines.push('**Response**');
        lines.push('');
        lines.push('```text');
        lines.push(request.responsePreview);
        lines.push('```');
        lines.push('');
      }
    } else {
      lines.push(
        '> [!info] No prompt or response body was stored for this request — ' +
          'the workspace uses metadata-only logging.',
      );
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push(`Part of [[OmniRouter]] · see [[Routing engine]] and [[Fallback engine]]`);

    const name = `${isoDay(request.createdAt)} ${shortId}${request.fallbackUsed ? ' (fallback)' : ''}`;
    await writeNote(join(dir, `${safeName(name)}.md`), lines.join('\n'));
  }

  return requests.length;
}

/* -------------------------------------------------------------------------- */
/* Documentation                                                               */
/* -------------------------------------------------------------------------- */

/** Maps a docs filename to the note title other notes will [[wikilink]] to. */
const DOC_TITLES: Record<string, string> = {
  'ARCHITECTURE.md': 'Architecture',
  'DATABASE_DESIGN.md': 'Database design',
  'PROVIDER_ADAPTERS.md': 'Provider adapters',
  'ROUTING_ENGINE.md': 'Routing engine',
  'FALLBACK_ENGINE.md': 'Fallback engine',
  'API_REFERENCE.md': 'API reference',
  'SECURITY_MODEL.md': 'Security model',
  'THREAT_MODEL.md': 'Threat model',
  'PRIVACY_MODEL.md': 'Privacy model',
  'PRODUCTION_HARDENING.md': 'Production hardening',
  'TEST_PLAN.md': 'Test plan',
  'DEPLOYMENT.md': 'Deployment',
  'DECISIONS.md': 'Decisions',
  'RESEARCH_NOTES.md': 'Research notes',
  'KNOWN_LIMITATIONS.md': 'Known limitations',
  'AUTHORSHIP_AUDIT.md': 'Authorship audit',
  'FINAL_PROJECT_REPORT.md': 'Final project report',
};

async function exportDocs(root: string, projectRoot: string): Promise<number> {
  const dir = join(root, 'Docs');
  await mkdir(dir, { recursive: true });
  await cleanGenerated(dir);

  const docsDir = join(projectRoot, 'docs');
  if (!existsSync(docsDir)) return 0;

  const files = (await readdir(docsDir)).filter((f) => f.endsWith('.md'));
  let written = 0;

  for (const file of files) {
    const title = DOC_TITLES[file] ?? basename(file, '.md');
    let content = await readFile(join(docsDir, file), 'utf8');

    // Rewrite relative markdown links into Obsidian wikilinks so the docs stay
    // navigable inside the vault rather than pointing at dead file paths.
    content = content.replace(
      /\[([^\]]+)\]\((?:\.\/)?([A-Z_]+\.md)\)/g,
      (_match, label: string, target: string) => {
        const targetTitle = DOC_TITLES[target];
        return targetTitle ? `[[${targetTitle}|${label}]]` : label;
      },
    );
    content = content.replace(
      /\[([^\]]+)\]\(docs\/([A-Z_]+\.md)\)/g,
      (_match, label: string, target: string) => {
        const targetTitle = DOC_TITLES[target];
        return targetTitle ? `[[${targetTitle}|${label}]]` : label;
      },
    );

    const body = [
      frontmatter({
        type: 'omnirouter-doc',
        source_file: `docs/${file}`,
        project: 'OmniRouter AI',
      }),
      content,
      '',
      '---',
      '',
      'Part of [[OmniRouter]]',
    ].join('\n');

    await writeNote(join(dir, `${safeName(title)}.md`), body);
    written += 1;
  }

  return written;
}

/* -------------------------------------------------------------------------- */
/* Analytics                                                                   */
/* -------------------------------------------------------------------------- */

async function exportAnalytics(root: string): Promise<void> {
  const dir = join(root, 'Analytics');
  await mkdir(dir, { recursive: true });
  await cleanGenerated(dir);

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 29);
  since.setUTCHours(0, 0, 0, 0);

  const [aggregate, byStatus, fallbacks, byModel, byError] = await Promise.all([
    prisma.request.aggregate({
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
      _avg: { totalLatencyMs: true },
    }),
    prisma.request.groupBy({
      by: ['status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.request.count({ where: { createdAt: { gte: since }, fallbackUsed: true } }),
    prisma.requestAttempt.groupBy({
      by: ['modelLabel'],
      where: { request: { createdAt: { gte: since } }, status: { not: 'SKIPPED' } },
      _count: { _all: true },
      _avg: { latencyMs: true },
    }),
    prisma.request.groupBy({
      by: ['errorCategory'],
      where: { createdAt: { gte: since }, errorCategory: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const total = aggregate._count._all;
  const succeeded = byStatus.find((r) => r.status === 'SUCCEEDED')?._count._all ?? 0;

  const lines: string[] = [];

  lines.push(
    frontmatter({
      type: 'omnirouter-analytics',
      generated: new Date().toISOString(),
      window_days: 30,
      total_requests: total,
      success_rate: total > 0 ? Number((succeeded / total).toFixed(4)) : 0,
      fallback_rate: total > 0 ? Number((fallbacks / total).toFixed(4)) : 0,
      estimated_cost: Number(aggregate._sum.estimatedCost ?? 0),
    }),
  );

  lines.push('# OmniRouter analytics');
  lines.push('');
  lines.push(
    `Last 30 days, generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.`,
  );
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | ---: |');
  lines.push(`| Requests | ${total} |`);
  lines.push(`| Succeeded | ${succeeded} |`);
  lines.push(
    `| Success rate | ${total > 0 ? ((succeeded / total) * 100).toFixed(1) : '0.0'}% |`,
  );
  lines.push(
    `| Fallback rate | ${total > 0 ? ((fallbacks / total) * 100).toFixed(1) : '0.0'}% |`,
  );
  lines.push(
    `| Average latency | ${Math.round(aggregate._avg.totalLatencyMs ?? 0)} ms |`,
  );
  lines.push(
    `| Tokens | ${(aggregate._sum.inputTokens ?? 0) + (aggregate._sum.outputTokens ?? 0)} |`,
  );
  lines.push(
    `| Estimated cost | $${Number(aggregate._sum.estimatedCost ?? 0).toFixed(6)} |`,
  );
  lines.push('');
  lines.push('> [!note] Estimates');
  lines.push(
    '> Token counts are heuristic unless a provider reported them, and cost derives ' +
      'from workspace-configured pricing. Both are planning signals, not a bill.',
  );
  lines.push('');

  if (byModel.length > 0) {
    lines.push('## Attempts by model');
    lines.push('');
    lines.push('| Model | Attempts | Avg latency |');
    lines.push('| --- | ---: | ---: |');
    for (const row of byModel.sort((a, b) => b._count._all - a._count._all)) {
      lines.push(
        `| \`${row.modelLabel}\` | ${row._count._all} | ${Math.round(row._avg.latencyMs ?? 0)} ms |`,
      );
    }
    lines.push('');
  }

  if (byError.length > 0) {
    lines.push('## Failures by category');
    lines.push('');
    lines.push('| Category | Count |');
    lines.push('| --- | ---: |');
    for (const row of byError.sort((a, b) => b._count._all - a._count._all)) {
      lines.push(`| ${row.errorCategory} | ${row._count._all} |`);
    }
    lines.push('');
  }

  lines.push('## Query your own data');
  lines.push('');
  lines.push('With the Dataview plugin installed:');
  lines.push('');
  lines.push('````');
  lines.push('```dataview');
  lines.push('TABLE model, attempts, latency_ms, estimated_cost');
  lines.push('FROM "OmniRouter/Requests"');
  lines.push('WHERE fallback_used = true');
  lines.push('SORT date DESC');
  lines.push('```');
  lines.push('````');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Part of [[OmniRouter]]');

  await writeNote(join(dir, 'Analytics summary.md'), lines.join('\n'));
}

/* -------------------------------------------------------------------------- */
/* Index                                                                       */
/* -------------------------------------------------------------------------- */

async function writeIndex(root: string, counts: Record<string, number>): Promise<void> {
  const lines: string[] = [];

  lines.push(
    frontmatter({
      type: 'omnirouter-index',
      generated: new Date().toISOString(),
      project: 'OmniRouter AI',
    }),
  );

  lines.push('# OmniRouter');
  lines.push('');
  lines.push(
    'An AI operations control plane: one endpoint for every provider, visual routing ' +
      'policies, classified fallback, request traces and usage analytics.',
  );
  lines.push('');
  lines.push('- Live: https://omnirouter-ai.vercel.app');
  lines.push('- Source: https://github.com/arslanvuzmal/omnirouter-ai');
  lines.push('');
  lines.push('## Contents');
  lines.push('');
  lines.push(`- **[[Analytics summary]]** — rolling 30-day figures`);
  lines.push(
    `- **Requests** — ${counts.requests ?? 0} traced requests in \`OmniRouter/Requests\``,
  );
  lines.push(
    `- **Sessions** — ${counts.sessions ?? 0} playground runs in \`OmniRouter/Sessions\``,
  );
  lines.push(`- **Docs** — ${counts.docs ?? 0} design documents`);
  lines.push('');
  lines.push('## Design');
  lines.push('');
  for (const title of [
    'Architecture',
    'Routing engine',
    'Fallback engine',
    'Database design',
    'Provider adapters',
    'API reference',
    'Security model',
    'Threat model',
    'Privacy model',
    'Decisions',
    'Known limitations',
  ]) {
    lines.push(`- [[${title}]]`);
  }
  lines.push('');
  lines.push('## Refresh');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run export:obsidian -- --vault "<path to this vault>"');
  lines.push('```');
  lines.push('');
  lines.push(
    '> [!info] Generated content\n' +
      '> Every note under `OmniRouter/` is regenerated by that command. ' +
      'Notes you write yourself are never touched, and the export refuses to ' +
      'replace a file it did not create.',
  );

  await writeNote(join(root, 'OmniRouter.md'), lines.join('\n'));
}

/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!options.vault) {
    console.error(
      '\nUsage: npm run export:obsidian -- --vault "<path to your Obsidian vault>"\n' +
        '\nOptions:\n' +
        '  --vault <path>   Required. The vault folder (the one containing .obsidian).\n' +
        '  --limit <n>      Max request notes to write. Default 300.\n' +
        '  --only <what>    all | requests | docs | sessions | analytics. Default all.\n',
    );
    process.exitCode = 1;
    return;
  }

  const vault = resolve(options.vault);

  if (!existsSync(vault)) {
    console.error(`\nVault not found: ${vault}\nCreate it in Obsidian first.\n`);
    process.exitCode = 1;
    return;
  }

  if (!existsSync(join(vault, '.obsidian'))) {
    console.warn(
      `\nNote: ${vault} has no .obsidian folder. Continuing, but check this is the ` +
        `vault root and not a subfolder.\n`,
    );
  }

  const root = join(vault, 'OmniRouter');
  await mkdir(root, { recursive: true });

  const projectRoot = resolve(process.cwd());
  const counts: Record<string, number> = {};

  console.log(`\nExporting to ${root}\n`);

  const wants = (what: Options['only']) =>
    options.only === 'all' || options.only === what;

  if (wants('requests')) {
    // API-, seed- and traffic-sourced requests are the operational record.
    counts.requests = await exportRequests(
      root,
      options.limit,
      ['api', 'seed', 'traffic', 'failure-demo'],
      'Requests',
    );
    console.log(`  Requests   ${counts.requests} notes`);
  }

  if (wants('sessions')) {
    // Playground runs are the exploratory record and deserve their own folder.
    counts.sessions = await exportRequests(
      root,
      options.limit,
      ['playground'],
      'Sessions',
    );
    console.log(`  Sessions   ${counts.sessions} notes`);
  }

  if (wants('docs')) {
    counts.docs = await exportDocs(root, projectRoot);
    console.log(`  Docs       ${counts.docs} notes`);
  }

  if (wants('analytics')) {
    await exportAnalytics(root);
    console.log('  Analytics  1 note');
  }

  await writeIndex(root, counts);
  console.log('  Index      OmniRouter.md');

  console.log(`\nDone. Open "OmniRouter" in your vault.\n`);
}

main()
  .catch((error) => {
    console.error('\nExport failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
