import type { ProviderKind } from '@/lib/database/generated/enums';

import type { ProviderAdapter } from '../types';
import { anthropicProvider } from './anthropic';
import { demoProvider } from './demo';
import { geminiProvider } from './gemini';
import { OpenAiCompatibleProvider } from './openai-compatible';

/**
 * Provider registry.
 *
 * Four of the seven adapters share the OpenAI-compatible implementation because
 * their wire contracts are identical; only their base URL, credential handling
 * and model naming differ. Anthropic and Gemini diverge enough to warrant their
 * own adapters, and the demo provider is entirely in-process.
 */

export const openAiProvider = new OpenAiCompatibleProvider({
  kind: 'OPENAI',
  displayName: 'OpenAI',
  defaultBaseUrl: 'https://api.openai.com/v1',
  requiresCredential: true,
  capabilityPatterns: {
    streaming: /.*/,
    structured_output: /gpt-4o|gpt-4\.1|gpt-5|o1|o3|o4/i,
    vision: /gpt-4o|gpt-4\.1|gpt-5|vision/i,
    tool_use: /gpt-4|gpt-5|o1|o3|o4/i,
  },
});

export const openRouterProvider = new OpenAiCompatibleProvider({
  kind: 'OPENROUTER',
  displayName: 'OpenRouter',
  defaultBaseUrl: 'https://openrouter.ai/api/v1',
  requiresCredential: true,
  capabilityPatterns: {
    streaming: /.*/,
    structured_output: /.*/,
    vision: /vision|gpt-4o|claude-3|gemini/i,
    tool_use: /gpt-4|claude|gemini|llama-3/i,
  },
});

export const deepSeekProvider = new OpenAiCompatibleProvider({
  kind: 'DEEPSEEK',
  displayName: 'DeepSeek',
  defaultBaseUrl: 'https://api.deepseek.com/v1',
  requiresCredential: true,
  capabilityPatterns: {
    streaming: /.*/,
    structured_output: /.*/,
    tool_use: /deepseek-chat|deepseek-v3/i,
  },
});

export const ollamaProvider = new OpenAiCompatibleProvider({
  kind: 'OLLAMA',
  displayName: 'Ollama',
  // Self-hosted: reachable without a credential, so the connection stores a
  // base URL instead of an API key.
  defaultBaseUrl: 'http://localhost:11434/v1',
  requiresCredential: false,
  capabilityPatterns: {
    streaming: /.*/,
    structured_output: /llama3|qwen|mistral|phi/i,
    vision: /llava|vision|bakllava/i,
    tool_use: /llama3\.1|llama3\.2|qwen2\.5|mistral/i,
  },
});

const REGISTRY: Record<ProviderKind, ProviderAdapter> = {
  DEMO: demoProvider,
  OPENAI: openAiProvider,
  ANTHROPIC: anthropicProvider,
  GEMINI: geminiProvider,
  OPENROUTER: openRouterProvider,
  DEEPSEEK: deepSeekProvider,
  OLLAMA: ollamaProvider,
};

export function getProvider(kind: ProviderKind): ProviderAdapter {
  const adapter = REGISTRY[kind];

  if (!adapter) {
    throw new Error(`No adapter is registered for provider kind "${kind}".`);
  }

  return adapter;
}

export function listProviders(): ProviderAdapter[] {
  return Object.values(REGISTRY);
}

/** Which environment variable supplies a fallback credential for each provider. */
export const PROVIDER_ENV_KEYS: Partial<Record<ProviderKind, string>> = {
  OPENAI: 'OPENAI_API_KEY',
  ANTHROPIC: 'ANTHROPIC_API_KEY',
  GEMINI: 'GEMINI_API_KEY',
  OPENROUTER: 'OPENROUTER_API_KEY',
  DEEPSEEK: 'DEEPSEEK_API_KEY',
};

export { demoProvider, anthropicProvider, geminiProvider };
export * from './demo';
