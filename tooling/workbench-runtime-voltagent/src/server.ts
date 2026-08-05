/**
 * Local VoltAgent sidecar for @uilab/agent-workbench RuntimePort adapter.
 *
 * Start (DeepSeek example):
 *   cp .env.example .env   # fill DEEPSEEK_API_KEY
 *   pnpm --filter @uilab/workbench-runtime-voltagent dev
 *
 * Env:
 *   DEEPSEEK_API_KEY or OPENAI_API_KEY
 *   OPENAI_BASE_URL — default https://api.deepseek.com (OpenAI-compatible)
 *   VOLTAGENT_MODEL — default deepseek-chat
 *   WORKSPACE_ROOT — absolute path tools may read/write
 *   PORT — default 3141
 *
 * Honesty: local sidecar only — not a multi-tenant production Runtime.
 * Never commit real API keys.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { Agent, VoltAgent } from '@voltagent/core'
import { createPinoLogger } from '@voltagent/logger'
import { honoServer } from '@voltagent/server-hono'
import { workbenchTools } from './tools.js'

const port = Number(process.env.PORT ?? 3141)
const modelId = process.env.VOLTAGENT_MODEL ?? 'deepseek-chat'
const apiKey =
  process.env.DEEPSEEK_API_KEY ??
  process.env.OPENAI_API_KEY ??
  process.env.VOLTAGENT_API_KEY
const baseURL =
  process.env.OPENAI_BASE_URL ??
  process.env.DEEPSEEK_BASE_URL ??
  'https://api.deepseek.com'

const logger = createPinoLogger({
  name: 'workbench-runtime-voltagent',
  level: (process.env.LOG_LEVEL as 'info' | 'debug' | 'warn' | 'error' | undefined) ?? 'info',
})

if (!apiKey) {
  logger.error(
    'Missing DEEPSEEK_API_KEY or OPENAI_API_KEY. Copy tooling/workbench-runtime-voltagent/.env.example → .env',
  )
  process.exit(1)
}

const provider = createOpenAI({
  apiKey,
  baseURL,
})

const workbenchAgent = new Agent({
  id: 'workbench',
  name: 'workbench',
  instructions: [
    'You are the local Agent Runtime for UI Lab Agent Workbench.',
    'Respond in Chinese unless the user writes in another language.',
    'You may use read_file, write_file (requires approval), and run_command tools when helpful.',
    'Prefer concise answers. Stay within the workspace tools for file access.',
    'This is a local demo sidecar, not a remote production cluster.',
  ].join(' '),
  model: provider(modelId),
  tools: workbenchTools,
  maxSteps: 12,
})

new VoltAgent({
  agents: {
    workbench: workbenchAgent,
  },
  server: honoServer({ port }),
  logger,
})

logger.info(
  `Workbench VoltAgent sidecar starting port=${port} model=${modelId} baseURL=${baseURL} agentId=workbench workspaceRoot=${process.env.WORKSPACE_ROOT ?? '(default)'}`,
)
