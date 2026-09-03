/**
 * Interactive Artifact sidecar runtime: staging + tools + HTTP mount.
 * Separate channel from board-runtime / board-staging.
 */

import path from 'node:path'
import type { Tool } from '@voltagent/core'
import type { Env, Hono, Schema } from 'hono'
import { defaultRuntimeConfigDir } from '../plugin/auth-binding-persist.js'
import { resolveSidecarHttpToken } from './board-auth.js'
import { interactiveClientTools } from './interactive-artifact-client-tools.js'
import { mountInteractiveArtifactRoutes } from './interactive-artifact-http.js'
import { InteractiveArtifactStaging } from './interactive-artifact-staging.js'
import {
  createInteractiveArtifactTools,
  interactiveArtifactToolsList,
  type InteractiveArtifactTools,
} from './interactive-artifact-tools.js'

export type CreateInteractiveArtifactRuntimeInput = {
  stagingRoot?: string
  token?: string | null
  env?: Record<string, string | undefined>
  now?: () => number
}

export type InteractiveArtifactRuntime = {
  staging: InteractiveArtifactStaging
  tools: InteractiveArtifactTools
  toolList: Tool[]
  token: string | null
  mountRoutes: <E extends Env, S extends Schema, BasePath extends string>(
    app: Hono<E, S, BasePath>,
  ) => void
}

export function defaultInteractiveArtifactStagingRoot(
  env: Record<string, string | undefined> = process.env,
): string {
  return path.join(defaultRuntimeConfigDir(env), 'interactive-artifact-staging')
}

export function createInteractiveArtifactRuntime(
  input: CreateInteractiveArtifactRuntimeInput = {},
): InteractiveArtifactRuntime {
  const env = input.env ?? process.env
  const staging = new InteractiveArtifactStaging({
    root: input.stagingRoot ?? defaultInteractiveArtifactStagingRoot(env),
    now: input.now,
  })
  const tools = createInteractiveArtifactTools(staging)
  const token = resolveSidecarHttpToken(env, input.token)
  return {
    staging,
    tools,
    toolList: [...interactiveArtifactToolsList(tools), ...interactiveClientTools],
    token,
    mountRoutes(app) {
      mountInteractiveArtifactRoutes(app, { staging, token, env })
    },
  }
}

let shared: InteractiveArtifactRuntime | null = null

export function getSharedInteractiveArtifactRuntime(
  input: CreateInteractiveArtifactRuntimeInput = {},
): InteractiveArtifactRuntime {
  if (!shared) {
    shared = createInteractiveArtifactRuntime(input)
  }
  return shared
}
