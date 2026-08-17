/**
 * Board sidecar runtime: staging + tools + HTTP mount.
 */

import path from 'node:path'
import type { Env, Hono, Schema } from 'hono'
import { defaultRuntimeConfigDir } from '../plugin/auth-binding-persist.js'
import { resolveSidecarHttpToken } from './board-auth.js'
import { mountBoardStagingRoutes } from './board-http.js'
import { BoardStaging } from './board-staging.js'
import { boardToolsList, createBoardTools, type BoardTools } from './board-tools.js'

export type CreateBoardRuntimeInput = {
  stagingRoot?: string
  token?: string | null
  env?: Record<string, string | undefined>
  now?: () => number
}

export type BoardRuntime = {
  staging: BoardStaging
  tools: BoardTools
  toolList: ReturnType<typeof boardToolsList>
  token: string | null
  mountRoutes: <E extends Env, S extends Schema, BasePath extends string>(
    app: Hono<E, S, BasePath>,
  ) => void
}

export function defaultBoardStagingRoot(
  env: Record<string, string | undefined> = process.env,
): string {
  return path.join(defaultRuntimeConfigDir(env), 'board-staging')
}

export function createBoardRuntime(input: CreateBoardRuntimeInput = {}): BoardRuntime {
  const env = input.env ?? process.env
  const staging = new BoardStaging({
    root: input.stagingRoot ?? defaultBoardStagingRoot(env),
    now: input.now,
  })
  const tools = createBoardTools(staging)
  const token = resolveSidecarHttpToken(env, input.token)
  return {
    staging,
    tools,
    toolList: boardToolsList(tools),
    token,
    mountRoutes(app) {
      mountBoardStagingRoutes(app, { staging, token, env })
    },
  }
}

let shared: BoardRuntime | null = null

export function getSharedBoardRuntime(
  input: CreateBoardRuntimeInput = {},
): BoardRuntime {
  if (!shared) {
    shared = createBoardRuntime(input)
  }
  return shared
}
