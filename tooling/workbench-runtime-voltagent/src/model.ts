/**
 * Model provider selection for the local Workbench VoltAgent sidecar.
 *
 * DeepSeek defaults to V4 Flash + Chat Completions.
 * AI SDK's createOpenAI(modelId) defaults to Responses API (/responses), which
 * breaks multi-step tool loops on DeepSeek unless model+surface match.
 * Chat Completions is the stable path for Workspace tool multi-step.
 */

import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'

export type ProfileEnv = Record<string, string | undefined>

/** Default: DeepSeek V4 Flash (not legacy deepseek-chat). */
export const DEFAULT_VOLTAGENT_MODEL = 'deepseek-v4-flash'

/**
 * Which OpenAI-compatible surface to use.
 * - chat: /chat/completions (stable multi-step tools; required for deepseek-v4-pro)
 * - responses: /responses (DeepSeek only fully documents deepseek-v4-flash here)
 */
export type ModelApiSurface = 'chat' | 'responses'

export function resolveModelId(env: ProfileEnv = process.env): string {
  const raw = env.VOLTAGENT_MODEL?.trim()
  return raw && raw.length > 0 ? raw : DEFAULT_VOLTAGENT_MODEL
}

/**
 * Default surface is chat (tool multi-step stability).
 * Set VOLTAGENT_MODEL_API=responses to opt into Responses API (flash only recommended).
 */
export function resolveModelApiSurface(
  env: ProfileEnv = process.env,
): ModelApiSurface {
  const raw = String(env.VOLTAGENT_MODEL_API ?? env.VOLTAGENT_API_SURFACE ?? 'chat')
    .trim()
    .toLowerCase()
  if (raw === 'responses' || raw === 'response') return 'responses'
  return 'chat'
}

export function createProvider(options: {
  apiKey: string
  baseURL: string
}): OpenAIProvider {
  return createOpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
  })
}

/**
 * Build a LanguageModel with an explicit API surface.
 * Prefer provider.chat() so DeepSeek/OpenAI-compatible tool loops stay on Chat Completions.
 */
export function createLanguageModel(
  provider: OpenAIProvider,
  modelId: string,
  surface: ModelApiSurface = 'chat',
): LanguageModel {
  if (surface === 'responses') {
    return provider.responses(modelId)
  }
  return provider.chat(modelId)
}
