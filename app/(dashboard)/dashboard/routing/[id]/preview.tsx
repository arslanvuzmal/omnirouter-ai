'use client';

import { Sparkles } from 'lucide-react';
import { useState, useTransition } from 'react';

import { RouteExplanationView } from '@/components/requests/trace';
import {
  Button,
  Field,
  Panel,
  PanelHeader,
  Textarea,
} from '@/components/ui/primitives';
import type { RouteExplanation } from '@/lib/ai/routing/types';

import { previewRouteAction } from './actions';

/**
 * Route preview.
 *
 * Evaluates the policy against a sample prompt without contacting any provider,
 * so an operator can see which target a change would select before shipping it.
 */
export function PolicyPreview({
  policyId,
  strategy,
}: {
  policyId: string;
  strategy: string;
}) {
  const [pending, startTransition] = useTransition();
  const [prompt, setPrompt] = useState(
    'Summarise this support thread and suggest the next action for the agent.',
  );
  const [explanation, setExplanation] = useState<RouteExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  function preview() {
    startTransition(async () => {
      const result = await previewRouteAction({ policyId, prompt });
      if (result.ok && result.explanation) {
        setExplanation(result.explanation);
        setError(null);
      } else {
        setError(result.error ?? 'Preview failed.');
        setExplanation(null);
      }
    });
  }

  return (
    <Panel>
      <PanelHeader
        title="Route preview"
        description="Runs the selection logic against a sample prompt without contacting a provider, so you can see what this policy would choose."
      />

      <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field
            label="Sample prompt"
            htmlFor="preview-prompt"
            hint="Its length determines the estimated token count, which affects cost-aware and context-based filtering."
          >
            <Textarea
              id="preview-prompt"
              rows={5}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </Field>

          <Button
            variant="primary"
            size="sm"
            onClick={preview}
            disabled={pending || !prompt.trim()}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {pending ? 'Evaluating…' : `Preview ${strategy} selection`}
          </Button>

          {error ? (
            <p className="text-[11px] text-danger-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-base-700 bg-base-900/60">
          {explanation ? (
            <RouteExplanationView explanation={explanation} />
          ) : (
            <p className="px-5 py-8 text-center text-xs text-ink-600">
              Run a preview to see the candidates, the rejections and the
              selection reason.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
