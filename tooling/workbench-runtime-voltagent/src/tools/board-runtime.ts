/**
 * Board sidecar runtime: staging + tools + HTTP mount.
 */

import path from 'node:path'
import type { Tool } from '@voltagent/core'
import type { Env, Hono, Schema } from 'hono'
import { defaultRuntimeConfigDir } from '../plugin/auth-binding-persist.js'
import { parseEnvStringList } from '../plugin/parse-util.js'
import {
  collectQueryHandlers,
  listQueryCatalog,
} from '../plugin/query-catalog.js'
import {
  QUERY_FIXTURE_BEARER_ENV,
  QUERY_FIXTURE_DEFAULT_RESOURCES,
  QUERY_FIXTURE_PACKAGE,
  QUERY_FIXTURE_PLUGIN_ID,
  createQueryFixtureUpstream,
} from '../plugin/query-fixture-package.js'
import { resolveSidecarHttpToken } from './board-auth.js'
import {
  BoardJobExecutor,
  resolveDenoExecutable,
  type ResolveDeno,
} from './board-job-executor.js'
import { mountBoardJobRoutes } from './board-job-http.js'
import { BoardJobStore, defaultBoardJobsRoot } from './board-job-store.js'
import {
  createAnonymousProductIdentity,
  createMemoryProductIdentity,
  type ProductIdentityPort,
} from './board-query-identity.js'
import {
  mountBoardQueryRoutes,
  type BoardQueryRuntime,
} from './board-query-http.js'
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
  /** Query catalog + trusted handlers + sidecar identity (ADR-0024 §2). */
  queries?: BoardQueryRuntime
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
  attachQueries: (next: BoardQueryRuntime) => void
}

export function productIdentityFromEnv(
  env: Record<string, string | undefined>,
): ProductIdentityPort {
  const bearer = env[QUERY_FIXTURE_BEARER_ENV]
  const upstream = createQueryFixtureUpstream({
    bearerToken: bearer || 'missing',
  })
  if (!bearer) {
    return createMemoryProductIdentity({ fetchImpl: upstream })
  }
  return createMemoryProductIdentity({
    principalKey: 'alice',
    resources: [...QUERY_FIXTURE_DEFAULT_RESOURCES],
    bearerToken: bearer,
    fetchImpl: upstream,
  })
}

function defaultQueryRuntime(
  env: Record<string, string | undefined>,
): BoardQueryRuntime {
  const disabled = new Set(parseEnvStringList(env.PLUGINS_DISABLED) ?? [])
  const forced = parseEnvStringList(env.PLUGINS_ENABLED) ?? []
  const fixtureOn =
    !disabled.has(QUERY_FIXTURE_PLUGIN_ID) &&
    forced.includes(QUERY_FIXTURE_PLUGIN_ID)
  const enabled = new Set(fixtureOn ? [QUERY_FIXTURE_PLUGIN_ID] : [])
  return {
    catalog: listQueryCatalog(QUERY_FIXTURE_PACKAGE.manifests, enabled),
    handlers: collectQueryHandlers([QUERY_FIXTURE_PACKAGE], enabled),
    identity: fixtureOn
      ? productIdentityFromEnv(env)
      : createAnonymousProductIdentity(),
  }
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
  let queryRuntime: BoardQueryRuntime =
    input.queries ?? defaultQueryRuntime(env)
  return {
    staging,
    jobs,
    executor,
    tools,
    toolList: [...boardToolsList(tools), ...boardClientTools],
    token,
    attachQueries(next) {
      queryRuntime = next
    },
    mountRoutes(app) {
      mountBoardStagingRoutes(app, { staging, token, env })
      mountBoardJobRoutes(app, { jobs, executor, token, env })
      mountBoardQueryRoutes(app, { getQueries: () => queryRuntime, token, env })
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
