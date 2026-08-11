/**
 * Model provider selection for the local Workbench VoltAgent sidecar.
 *
 * Provider dialects stay in this sidecar boundary. Connectors and Workbench
 * events consume only the AI SDK LanguageModel contract.
 */

import { createDeepSeek, type DeepSeekProvider } from '@ai-sdk/deepseek'
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'

export type ProfileEnv = Record<string, string | undefined>

/** Default: DeepSeek V4 Flash (not legacy deepseek-chat). */
export const DEFAULT_VOLTAGENT_MODEL = 'deepseek-v4-flash'

export type ModelProviderKind = 'deepseek' | 'openai'
export type WorkbenchModelProvider = DeepSeekProvider | OpenAIProvider

export interface ModelConnection {
  apiKey: string | undefined
  baseURL: string
}

export function resolveModelProviderKind(
  env: ProfileEnv = process.env,
): ModelProviderKind {
  const raw = String(env.VOLTAGENT_MODEL_PROVIDER ?? 'deepseek')
    .trim()
    .toLowerCase()
  if (raw === 'deepseek' || raw === 'openai') return raw
  throw new Error(`Unsupported model provider: ${raw || '(empty)'}`)
}

export function resolveModelConnection(
  kind: ModelProviderKind,
  env: ProfileEnv = process.env,
): ModelConnection {
  if (kind === 'openai') {
    return {
      apiKey: env.OPENAI_API_KEY ?? env.VOLTAGENT_API_KEY,
      baseURL:
        env.VOLTAGENT_BASE_URL ??
        env.OPENAI_BASE_URL ??
        'https://api.openai.com/v1',
    }
  }

  return {
    apiKey:
      env.DEEPSEEK_API_KEY ??
      env.VOLTAGENT_API_KEY ??
      env.OPENAI_API_KEY,
    baseURL:
      env.VOLTAGENT_BASE_URL ??
      env.DEEPSEEK_BASE_URL ??
      env.OPENAI_BASE_URL ??
      'https://api.deepseek.com',
  }
}

/**
 * Which API surface to use.
 * - chat: /chat/completions (DeepSeek and OpenAI)
 * - responses: /responses (explicit OpenAI provider only)
 */
export type ModelApiSurface = 'chat' | 'responses'

export function resolveModelId(env: ProfileEnv = process.env): string {
  const raw = env.VOLTAGENT_MODEL?.trim()
  return raw && raw.length > 0 ? raw : DEFAULT_VOLTAGENT_MODEL
}

/**
 * Default surface is Chat Completions. DeepSeek rejects a Responses selection
 * at startup; an explicit OpenAI provider may opt into it.
 */
export function resolveModelApiSurface(
  env: ProfileEnv = process.env,
): ModelApiSurface {
  const raw = String(env.VOLTAGENT_MODEL_API ?? env.VOLTAGENT_API_SURFACE ?? 'chat')
    .trim()
    .toLowerCase()
  if (raw === 'responses' || raw === 'response') {
    if (resolveModelProviderKind(env) === 'deepseek') {
      throw new Error(
        'DeepSeek uses Chat Completions in this runtime; Responses API is unsupported',
      )
    }
    return 'responses'
  }
  return 'chat'
}

export function createProvider(options: {
  kind?: ModelProviderKind
  apiKey: string
  baseURL: string
}): WorkbenchModelProvider {
  const settings = {
    apiKey: options.apiKey,
    baseURL: options.baseURL,
  }
  if (options.kind === 'openai') return createOpenAI(settings)
  return createDeepSeek(settings)
}

/**
 * Build a LanguageModel with an explicit API surface. Provider-specific wire
 * fields remain inside the selected AI SDK provider.
 */
export function createLanguageModel(
  provider: WorkbenchModelProvider,
  modelId: string,
  surface: ModelApiSurface = 'chat',
): LanguageModel {
  if (surface === 'responses') {
    if ('responses' in provider && typeof provider.responses === 'function') {
      return provider.responses(modelId)
    }
    throw new Error('The selected model provider does not support Responses API')
  }
  return provider.chat(modelId)
}
