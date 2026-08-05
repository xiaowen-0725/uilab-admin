/**
 * Local VoltAgent sidecar for @uilab/agent-workbench RuntimePort adapter.
 *
 * Start:
 *   cd tooling/workbench-runtime-voltagent && pnpm install && pnpm dev
 *
 * Env:
 *   OPENAI_API_KEY (or compatible provider keys for ai-sdk)
 *   WORKSPACE_ROOT — absolute path tools may read/write
 *   PORT — default 3141
 *
 * Honesty: local sidecar only — not a multi-tenant production Runtime.
 */

import { openai } from '@ai-sdk/openai'
import { Agent, VoltAgent } from '@voltagent/core'
import { createPinoLogger } from '@voltagent/logger'
import { honoServer } from '@voltagent/server-hono'
import { workbenchTools } from './tools.js'

const port = Number(process.env.PORT ?? 3141)
const modelId = process.env.VOLTAGENT_MODEL ?? 'gpt-4o-mini'

const logger = createPinoLogger({
  name: 'workbench-runtime-voltagent',
  level: (process.env.LOG_LEVEL as 'info' | 'debug' | 'warn' | 'error' | undefined) ?? 'info',
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
  model: openai(modelId),
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
  `Workbench VoltAgent sidecar starting port=${port} model=${modelId} agentId=workbench workspaceRoot=${process.env.WORKSPACE_ROOT ?? '(default)'}`,
)
