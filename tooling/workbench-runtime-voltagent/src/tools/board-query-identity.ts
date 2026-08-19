/**
 * Sidecar Product Identity for query execution (ADR-0024 §2).
 * Credentials stay in this process — never on the HTTP response, logs, or job sandbox.
 */

export type QueryAuthorizedResource = {
  type: string
  id: string
  name: string
  permissions: readonly string[]
}

export type QueryAuthorization =
  | { readonly kind: 'unrestricted' }
  | { readonly kind: 'resources'; readonly resources: readonly QueryAuthorizedResource[] }

export type QueryIdentitySnapshot = {
  readonly principalKey: string
  readonly authorization: QueryAuthorization
}

export type ProductIdentityPort = {
  getSnapshot(): QueryIdentitySnapshot
  /** Returns a fetch that attaches identity credentials. Callers must not log it. */
  createSignedFetch(): typeof fetch
  /** True when `text` contains the raw credential. Never returns the secret. */
  containsCredential(text: string): boolean
}

export type CreateMemoryProductIdentityInput = {
  principalKey?: string
  authorization?: QueryAuthorization
  resources?: readonly QueryAuthorizedResource[]
  bearerToken?: string
  fetchImpl?: typeof fetch
}

export function createAnonymousProductIdentity(): ProductIdentityPort {
  return createMemoryProductIdentity({})
}

export function createMemoryProductIdentity(
  input: CreateMemoryProductIdentityInput = {},
): ProductIdentityPort {
  const authorization: QueryAuthorization =
    input.authorization ??
    (input.resources
      ? { kind: 'resources', resources: input.resources }
      : { kind: 'unrestricted' })
  const principalKey = input.principalKey ?? 'anonymous'
  const bearerToken = input.bearerToken
  const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis)

  return {
    getSnapshot() {
      return { principalKey, authorization }
    },
    createSignedFetch() {
      return async (request, init) => {
        const headers = new Headers(init?.headers)
        if (bearerToken) headers.set('authorization', `Bearer ${bearerToken}`)
        return fetchImpl(request, { ...init, headers })
      }
    },
    containsCredential(text: string) {
      return Boolean(bearerToken && text.includes(bearerToken))
    },
  }
}
