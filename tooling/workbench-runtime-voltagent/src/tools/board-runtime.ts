/**
 * Board sidecar runtime: staging + tools + HTTP mount.
 */

import path from 'node:path'
import type { Tool } from '@voltagent/core'
import type { Env, Hono, Schema } from 'hono'
import { defaultRuntimeConfigDir } from '../plugin/auth-binding-persist.js'
import { resolveSidecarHttpToken } from './board-auth.js'
import {
  BoardJobExecutor,
  resolveDenoExecutable,
  type ResolveDeno,
} from './board-job-executor.js'
import { mountBoardJobRoutes } from './board-job-http.js'
import { BoardJobStore, defaultBoardJobsRoot } from './board-job-store.js'
import { mountBoardStagingRoutes } from './board-http.js'
import { BoardStaging } from './board-staging.js'
import { boardClientTools } from './board-client-tools.js'
import { boardToolsList, createBoardTools, type BoardTools } from './board-tools.js'

export type CreateBoardRuntimeInput = {
  stagingRoot?: string
  jobsRoot?: string
  token?: string | null
  env?: Record<string, string | undefined>
  now?: () => number
  resolveDeno?: ResolveDeno
}

export type BoardRuntime = {
  staging: BoardStaging
  jobs: BoardJobStore
  executor: BoardJobExecutor
  tools: BoardTools
  toolList: Tool[]
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
  const jobs = new BoardJobStore(
    input.jobsRoot ?? defaultBoardJobsRoot(env),
    env,
  )
  const executor = new BoardJobExecutor(
    jobs,
    input.resolveDeno ?? function resolveDeno() {
      return resolveDenoExecutable(env)
    },
  )
  const tools = createBoardTools(staging, jobs)
  const token = resolveSidecarHttpToken(env, input.token)
  return {
    staging,
    jobs,
    executor,
    tools,
    toolList: [...boardToolsList(tools), ...boardClientTools],
    token,
    mountRoutes(app) {
      mountBoardStagingRoutes(app, { staging, token, env })
      mountBoardJobRoutes(app, { jobs, executor, token, env })
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
