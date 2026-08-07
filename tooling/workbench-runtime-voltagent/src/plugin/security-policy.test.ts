import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  decideCliCommandNeedsApproval,
  decideToolNeedsApproval,
  filterChildEnv,
  formatSafeStatusLine,
  isAllowedAuthEnvName,
  isModelProviderSecretKey,
  redactSecretValues,
  stripModelProviderSecrets,
} from './security-policy.js'

describe('decideToolNeedsApproval', () => {
  it('fail-closed: empty allowlist means all tools need approval', () => {
    assert.equal(
      decideToolNeedsApproval({ toolName: 'docs_read_document' }),
      true,
    )
    assert.equal(
      decideToolNeedsApproval({ toolName: 'anything', readOnlyAllowlist: new Set() }),
      true,
    )
  })

  it('exact allowlist frees only matching names', () => {
    const allow = new Set(['docs_read_document', 'list_calendars'])
    assert.equal(
      decideToolNeedsApproval({
        toolName: 'docs_read_document',
        readOnlyAllowlist: allow,
      }),
      false,
    )
    assert.equal(
      decideToolNeedsApproval({
        toolName: 'Docs-Read-Document',
        readOnlyAllowlist: allow,
      }),
      false,
    )
    assert.equal(
      decideToolNeedsApproval({
        toolName: 'docs_get_and_set',
        readOnlyAllowlist: allow,
      }),
      true,
    )
  })
})

describe('decideCliCommandNeedsApproval', () => {
  it('defaults to needing approval', () => {
    assert.equal(decideCliCommandNeedsApproval({}), true)
  })

  it('honors explicit flags fail-closed', () => {
    // needsApproval:false alone is NOT free
    assert.equal(decideCliCommandNeedsApproval({ needsApproval: false }), true)
    assert.equal(
      decideCliCommandNeedsApproval({
        needsApproval: false,
        readOnly: true,
      }),
      false,
    )
    assert.equal(decideCliCommandNeedsApproval({ needsApproval: true }), true)
    assert.equal(decideCliCommandNeedsApproval({ readOnly: true }), false)
    assert.equal(
      decideCliCommandNeedsApproval({ readOnly: true, needsApproval: true }),
      true,
    )
  })
})

describe('isModelProviderSecretKey + filterChildEnv', () => {
  it('detects model keys and allows connector app secrets', () => {
    assert.equal(isModelProviderSecretKey('DEEPSEEK_API_KEY'), true)
    assert.equal(isModelProviderSecretKey('GEMINI_API_KEY'), true)
    assert.equal(isModelProviderSecretKey('OPENAI_API_KEY'), true)
    assert.equal(isModelProviderSecretKey('HF_TOKEN'), true)
    assert.equal(isModelProviderSecretKey('AWS_SECRET_ACCESS_KEY'), true)
    assert.equal(isModelProviderSecretKey('GITHUB_PAT'), true)
    assert.equal(isModelProviderSecretKey('GH_TOKEN'), true)
    assert.equal(isModelProviderSecretKey('FEISHU_APP_SECRET'), false)
    assert.equal(isModelProviderSecretKey('GOOGLE_APPLICATION_CREDENTIALS'), false)
  })

  it('injects allowed keys and base PATH-like keys; denies model keys', () => {
    const out = filterChildEnv(
      {
        PATH: '/bin',
        HOME: '/home/u',
        FEISHU_APP_ID: 'app',
        DEEPSEEK_API_KEY: 'sk-secret',
        GEMINI_API_KEY: 'g',
        CUSTOM: 'x',
      },
      ['FEISHU_APP_ID', 'DEEPSEEK_API_KEY', 'CUSTOM'],
    )
    assert.equal(out.PATH, '/bin')
    assert.equal(out.HOME, '/home/u')
    assert.equal(out.FEISHU_APP_ID, 'app')
    assert.equal(out.CUSTOM, 'x')
    assert.equal(out.DEEPSEEK_API_KEY, undefined)
    assert.equal(out.GEMINI_API_KEY, undefined)
  })

  it('can omit base keys when requested', () => {
    const out = filterChildEnv(
      { PATH: '/bin', FOO: '1' },
      ['FOO'],
      { includeBaseKeys: false },
    )
    assert.equal(out.FOO, '1')
    assert.equal(out.PATH, undefined)
  })

  it('stripModelProviderSecrets removes re-injected model keys (P0)', () => {
    const stripped = stripModelProviderSecrets({
      PATH: '/bin',
      FEISHU_APP_SECRET: 'ok',
      OPENAI_API_KEY: 'sk-should-go',
      GITHUB_PAT: 'ghp-should-go',
    })
    assert.equal(stripped.PATH, '/bin')
    assert.equal(stripped.FEISHU_APP_SECRET, 'ok')
    assert.equal(stripped.OPENAI_API_KEY, undefined)
    assert.equal(stripped.GITHUB_PAT, undefined)
  })

  it('isAllowedAuthEnvName blocks LLM keys but allows connector tokens', () => {
    assert.equal(isAllowedAuthEnvName('OPENAI_API_KEY'), false)
    assert.equal(isAllowedAuthEnvName('ANTHROPIC_API_KEY'), false)
    assert.equal(isAllowedAuthEnvName('DEEPSEEK_API_KEY'), false)
    assert.equal(isAllowedAuthEnvName('HF_TOKEN'), false)
    assert.equal(isAllowedAuthEnvName('GITHUB_PAT'), true)
    assert.equal(isAllowedAuthEnvName('FEISHU_APP_SECRET'), true)
    assert.equal(isAllowedAuthEnvName('MCP_DOCS_BEARER_TOKEN'), true)
  })
})

describe('log safety helpers', () => {
  it('formatSafeStatusLine joins non-empty parts', () => {
    assert.equal(
      formatSafeStatusLine(['auth=missing', null, '', 'hint=去登录']),
      'auth=missing hint=去登录',
    )
  })

  it('redactSecretValues strips known secrets', () => {
    assert.equal(
      redactSecretValues('token=sk-abc123 end', ['sk-abc123']),
      'token=*** end',
    )
  })
})
