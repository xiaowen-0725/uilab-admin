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

/**
 * Non-secret OAuth session metadata for bindings (#31).
 * Tokens live only in SecretStore (keychain); never embed token values here.
 */
export type OAuthBindingMeta = {
  tokenEndpoint: string
  clientId: string
  /** Keychain/memory account holding refresh_token */
  refreshAccount: string
  authorizationEndpoint?: string
  redirectUri?: string
  scopes?: string[]
}

/** Binding: plugin resource → how to resolve credentials (no secret values). */
export type AuthBinding = {
  pluginId: string
  resourceId: string
  kind: CredentialKind
  /** env names that must be present for env_ref / app_client MVP checks */
  envNames?: string[]
  /** optional single secret ref (e.g. PAT or oauth access token) */
  secretRef?: SecretRef
  /** Chinese-friendly operator hint when missing */
  loginHint?: string
  /**
   * Non-secret expiry (unix ms). When past → auth=expired and inject is blocked.
   * Safe to persist in config (not a token).
   */
  expiresAt?: number
  /** OAuth2 session metadata (kind=oauth2) */
  oauth?: OAuthBindingMeta
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

/**
 * Resolved credential material for inject (#28).
 * Never log envValues / bearerToken. Status is the single truth for doctor + inject.
 */
export type CredentialMaterial = {
  status: AuthStatus
  hint?: string
  /** HTTP Authorization Bearer value when kind is static_bearer / env_ref PAT */
  bearerToken?: string
  /** Named secret env values for closed child-env inject */
  envValues: Record<string, string>
  /**
   * Env names controlled by this binding — when status !== connected,
   * loaders must strip these even if process env still has leftovers.
   */
  controlledEnvNames: string[]
}
