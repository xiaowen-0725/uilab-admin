import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  discoverMcpOAuthEndpoints,
  parseResourceMetadataUrl,
} from './oauth-discovery.js'

describe('MCP OAuth discovery', () => {
  it('honors WWW-Authenticate resource_metadata and authorization-server metadata', async () => {
    const calls: string[] = []
    const discovered = await discoverMcpOAuthEndpoints(
      'https://api.githubcopilot.com/mcp/',
      async (input) => {
        calls.push(input)
        if (input === 'https://api.githubcopilot.com/mcp/') {
          return {
            ok: false,
            status: 401,
            headers: new Headers({
              'www-authenticate':
                'Bearer error="invalid_request", resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/"',
            }),
            json: async () => ({}),
            text: async () => '',
          }
        }
        if (
          input ===
          'https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/'
        ) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({
              resource: 'https://api.githubcopilot.com/mcp/',
              authorization_servers: ['https://github.com/login/oauth'],
            }),
            text: async () => '',
          }
        }
        assert.equal(
          input,
          'https://github.com/.well-known/oauth-authorization-server/login/oauth',
        )
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            issuer: 'https://github.com/login/oauth',
            authorization_endpoint: 'https://github.com/login/oauth/authorize',
            token_endpoint: 'https://github.com/login/oauth/access_token',
            code_challenge_methods_supported: ['S256'],
          }),
          text: async () => '',
        }
      },
    )

    assert.deepEqual(discovered, {
      resource: 'https://api.githubcopilot.com/mcp/',
      authorizationServer: 'https://github.com/login/oauth',
      authorizationEndpoint: 'https://github.com/login/oauth/authorize',
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
    })
    assert.equal(calls.length, 3)
  })

  it('rejects a challenge without HTTPS resource metadata', () => {
    assert.throws(
      () =>
        parseResourceMetadataUrl(
          'Bearer resource_metadata="http://attacker.test/metadata"',
        ),
      /HTTPS/,
    )
  })
})
