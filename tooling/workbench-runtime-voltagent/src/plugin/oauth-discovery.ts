/**
 * OAuth 2.1 discovery for remote MCP resources.
 * Follows the resource_metadata challenge instead of hard-coding Provider
 * authorization endpoints.
 */

export type OAuthDiscoveryFetch = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean
  status: number
  headers: Headers
  json: () => Promise<unknown>
  text: () => Promise<string>
}>

export type DiscoveredMcpOAuthEndpoints = {
  resource: string
  authorizationServer: string
  authorizationEndpoint: string
  tokenEndpoint: string
}

export function parseResourceMetadataUrl(challenge: string | null): string {
  const match = challenge?.match(/\bresource_metadata\s*=\s*"([^"]+)"/i)
  if (!match?.[1]) {
    throw new Error('MCP OAuth challenge 缺少 resource_metadata')
  }
  const url = new URL(match[1])
  if (url.protocol !== 'https:') {
    throw new Error('MCP OAuth resource_metadata 必须使用 HTTPS')
  }
  return url.toString()
}

export function authorizationServerMetadataUrl(issuer: string): string {
  const url = new URL(issuer)
  if (url.protocol !== 'https:') {
    throw new Error('OAuth authorization server 必须使用 HTTPS')
  }
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
  return `${url.origin}/.well-known/oauth-authorization-server${path}`
}

function requireHttpsEndpoint(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`OAuth metadata 缺少 ${label}`)
  }
  const url = new URL(value)
  if (url.protocol !== 'https:') {
    throw new Error(`OAuth ${label} 必须使用 HTTPS`)
  }
  return url.toString()
}

export async function discoverMcpOAuthEndpoints(
  mcpUrl: string,
  fetchImpl: OAuthDiscoveryFetch = globalThis.fetch as OAuthDiscoveryFetch,
): Promise<DiscoveredMcpOAuthEndpoints> {
  const target = new URL(mcpUrl)
  if (target.protocol !== 'https:') {
    throw new Error('远程 MCP OAuth 仅允许 HTTPS endpoint')
  }

  const probe = await fetchImpl(target.toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'uilab-oauth-discovery',
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'uilab-agent-workbench', version: '1.0.0' },
      },
    }),
  })
  const metadataUrl = parseResourceMetadataUrl(
    probe.headers.get('www-authenticate'),
  )
  const resourceResponse = await fetchImpl(metadataUrl, {
    headers: { Accept: 'application/json' },
  })
  if (!resourceResponse.ok) {
    throw new Error(
      `MCP OAuth protected-resource metadata HTTP ${resourceResponse.status}`,
    )
  }
  const resourceMetadata = (await resourceResponse.json()) as Record<
    string,
    unknown
  >
  const resource = requireHttpsEndpoint(resourceMetadata.resource, 'resource')
  const authorizationServers = resourceMetadata.authorization_servers
  if (
    !Array.isArray(authorizationServers) ||
    typeof authorizationServers[0] !== 'string'
  ) {
    throw new Error('MCP OAuth metadata 缺少 authorization_servers')
  }
  const authorizationServer = requireHttpsEndpoint(
    authorizationServers[0],
    'authorization_server',
  ).replace(/\/$/, '')
  const serverMetadataResponse = await fetchImpl(
    authorizationServerMetadataUrl(authorizationServer),
    { headers: { Accept: 'application/json' } },
  )
  if (!serverMetadataResponse.ok) {
    throw new Error(
      `OAuth authorization-server metadata HTTP ${serverMetadataResponse.status}`,
    )
  }
  const serverMetadata = (await serverMetadataResponse.json()) as Record<
    string,
    unknown
  >
  const methods = serverMetadata.code_challenge_methods_supported
  if (!Array.isArray(methods) || !methods.includes('S256')) {
    throw new Error('OAuth authorization server 不支持 PKCE S256')
  }

  return {
    resource,
    authorizationServer,
    authorizationEndpoint: requireHttpsEndpoint(
      serverMetadata.authorization_endpoint,
      'authorization_endpoint',
    ),
    tokenEndpoint: requireHttpsEndpoint(
      serverMetadata.token_endpoint,
      'token_endpoint',
    ),
  }
}
