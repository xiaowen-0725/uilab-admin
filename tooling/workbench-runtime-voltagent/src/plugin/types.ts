/**
 * Stable plugin-kernel types (Spec #17 / ticket #18).
 * No filesystem or network I/O here.
 */

/** Process env map used by sidecar (testable without real process.env). */
export type ProfileEnv = Record<string, string | undefined>

/** Credential material kinds (oauth2/keychain backends later). */
export type CredentialKind =
  | 'env_ref'
  | 'static_bearer'
  | 'oauth2'
  | 'cli_session'
  | 'app_client'

/**
 * Non-secret pointer to credential material.
 * Safe to persist in config files / logs summaries (id is a name, not the value).
 */
export type SecretRef =
  | { backend: 'env'; envName: string }
  | { backend: 'memory'; key: string }
  | { backend: 'keychain'; account: string }

/** User-visible auth status for a plugin resource (enable ≠ login). */
export type AuthStatus =
  | 'none_required'
  | 'missing'
  | 'connected'
  | 'expired'
  | 'error'

/** Binding: plugin resource → how to resolve credentials (no secret values). */
export type AuthBinding = {
  pluginId: string
  resourceId: string
  kind: CredentialKind
  /** env names that must be present for env_ref / app_client MVP checks */
  envNames?: string[]
  /** optional single secret ref (e.g. PAT) */
  secretRef?: SecretRef
  /** Chinese-friendly operator hint when missing */
  loginHint?: string
  /** for cli_session: expected non-zero means not connected (host runs later) */
  statusCommand?: {
    command: string
    argv?: string[]
  }
}

export type AuthStatusResult = {
  status: AuthStatus
  /** Safe for logs/UI — never includes secret material */
  hint?: string
}
