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
 *   VOLTAGENT_MODEL — default deepseek-v4-flash (legacy: deepseek-chat)
 *   VOLTAGENT_MODEL_API — chat (default, stable tools) | responses (flash only)
 *   AGENT_PROFILE — office | minimal (default minimal)
 *   WORKSPACE_ROOT — absolute path tools may read/write
 *   PORT — default 3141
 *
 * Honesty: local sidecar only — not a multi-tenant production Runtime.
 * Never commit real API keys.
 */

import { VoltAgent } from '@voltagent/core'
import { createPinoLogger } from '@voltagent/logger'
import { honoServer } from '@voltagent/server-hono'
import { createWorkbenchAgent } from './create-agent.js'
import {
  createLanguageModel,
  createProvider,
  resolveModelApiSurface,
  resolveModelId,
} from './model.js'
import { resolveAgentProfile } from './profile.js'

const port = Number(process.env.PORT ?? 3141)
const modelId = resolveModelId(process.env)
const modelApi = resolveModelApiSurface(process.env)
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

const provider = createProvider({ apiKey, baseURL })
const model = createLanguageModel(provider, modelId, modelApi)

const profile = resolveAgentProfile(process.env)

const {
  agent,
  workspaceRoot,
  tools,
  profile: resolvedProfile,
  maxSteps,
  summarizationEnabled,
  memoryKind,
  mcpStatusLine,
  mcpStatuses,
  cliStatusLine,
  cliStatuses,
  authStatusLine,
  authDoctorLine,
  discoveryFailures,
  disconnectMcp,
} = await createWorkbenchAgent({
  profile,
  model,
})

new VoltAgent({
  agents: {
    workbench: agent,
  },
  server: honoServer({
    port,
    hostname: '127.0.0.1',
    /**
     * Workbench Document Surface — read-only workspace file bytes.
     * Not a tool call; not multi-tenant production storage.
     */
    configureApp: (app) => {
      app.get('/workspace/info', (c) =>
        c.json({
          workspaceRoot,
          profile: resolvedProfile,
          note: 'local sidecar workspace — not remote production storage',
        }),
      )

      app.get('/workspace/file', async (c) => {
        const filePath = c.req.query('path') ?? ''
        const maxRaw = c.req.query('maxBytes')
        const maxBytes = maxRaw ? Number(maxRaw) : undefined
        const {
          readWorkspaceFile,
          httpStatusForWorkspaceRead,
          guessMimeFromPath,
        } = await import('./workspace-file-api.js')

        const result = await readWorkspaceFile(workspaceRoot, filePath, {
          maxBytes:
            Number.isFinite(maxBytes) && (maxBytes as number) > 0
              ? (maxBytes as number)
              : undefined,
        })

        if (!result.ok) {
          return c.json(
            {
              ok: false,
              reason: result.reason,
              message: result.message,
            },
            httpStatusForWorkspaceRead(result.reason) as 400 | 403 | 404 | 413 | 500,
          )
        }

        const mime = guessMimeFromPath(result.relativePath)
        c.header('Content-Type', mime)
        c.header('X-Workspace-Relative-Path', result.relativePath)
        c.header('X-Byte-Length', String(result.byteLength))
        c.header('Cache-Control', 'no-store')
        return c.body(result.bytes)
      })
    },
  }),
  logger,
})

for (const s of mcpStatuses) {
  if (s.status === 'failed') {
    logger.warn(`MCP ${s.serverId} failed: ${s.reason ?? 'unknown'}`)
  } else if (s.status === 'connected') {
    logger.info(
      `MCP ${s.serverId} connected transport=${s.transport ?? '?'} tools=${s.toolNames.join(',') || '(none)'}`,
    )
  }
}

for (const s of cliStatuses) {
  if (s.status === 'missing' || s.status === 'failed') {
    logger.warn(`CLI ${s.cliId} ${s.status}: ${s.reason ?? 'unknown'}`)
  } else if (s.status === 'ready') {
    logger.info(
      `CLI ${s.cliId} ready tools=${s.toolNames.join(',') || '(none)'}`,
    )
  }
}

logger.info(
  [
    'Workbench VoltAgent sidecar starting',
    `profile=${resolvedProfile}`,
    `port=${port}`,
    `model=${modelId}`,
    `modelApi=${modelApi}`,
    `baseURL=${baseURL}`,
    'agentId=workbench',
    `workspaceRoot=${workspaceRoot}`,
    `maxSteps=${maxSteps}`,
    `summarization=${summarizationEnabled}`,
    `memory=${memoryKind}`,
    `mcp=${mcpStatusLine}`,
    `cli=${cliStatusLine}`,
    `auth=${authStatusLine}`,
    `tools=${tools.join(',')}`,
    resolvedProfile === 'office'
      ? 'note=local VoltAgent Office Runtime (Agent+Workspace FS+Skills+optional MCP/CLI); not remote production cluster'
      : 'note=local minimal Runtime (DIY tools); not remote production cluster',
  ].join(' '),
)

if (resolvedProfile === 'office' && authDoctorLine !== 'auth=none') {
  logger.info(`plugin auth doctor: ${authDoctorLine}`)
}

for (const f of discoveryFailures) {
  logger.warn(`plugin discovery failed id=${f.id}: ${f.reason} (${f.sourcePath})`)
}

const shutdown = async () => {
  try {
    await disconnectMcp()
  } catch {
    // best-effort
  }
  process.exit(0)
}
process.once('SIGINT', () => {
  void shutdown()
})
process.once('SIGTERM', () => {
  void shutdown()
})
