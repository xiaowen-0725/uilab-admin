import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generateText, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import {
  DEFAULT_VOLTAGENT_MODEL,
  createLanguageModel,
  createProvider,
  resolveModelApiSurface,
  resolveModelId,
  resolveModelProviderKind,
} from './model.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('resolveModelId', () => {
  it('defaults to deepseek-v4-flash', () => {
    assert.equal(resolveModelId({}), DEFAULT_VOLTAGENT_MODEL)
    assert.equal(resolveModelId({}), 'deepseek-v4-flash')
  })

  it('honors VOLTAGENT_MODEL override', () => {
    assert.equal(
      resolveModelId({ VOLTAGENT_MODEL: 'deepseek-v4-pro' }),
      'deepseek-v4-pro',
    )
    assert.equal(
      resolveModelId({ VOLTAGENT_MODEL: 'deepseek-chat' }),
      'deepseek-chat',
    )
  })
})

describe('resolveModelProviderKind', () => {
  it('defaults explicitly to DeepSeek', () => {
    assert.equal(resolveModelProviderKind({}), 'deepseek')
  })

  it('uses OpenAI only when explicitly configured', () => {
    assert.equal(
      resolveModelProviderKind({ VOLTAGENT_MODEL_PROVIDER: 'openai' }),
      'openai',
    )
  })

  it('rejects unknown providers instead of guessing from another setting', () => {
    assert.throws(
      () =>
        resolveModelProviderKind({
          VOLTAGENT_MODEL_PROVIDER: 'compatible-proxy',
          VOLTAGENT_MODEL: 'deepseek-v4-flash',
          OPENAI_BASE_URL: 'https://api.deepseek.com',
        }),
      /Unsupported model provider/,
    )
  })
})

describe('resolveModelApiSurface', () => {
  it('defaults to chat for multi-step tool stability', () => {
    assert.equal(resolveModelApiSurface({}), 'chat')
    assert.equal(resolveModelApiSurface({ VOLTAGENT_MODEL_API: '' }), 'chat')
  })

  it('rejects Responses API for DeepSeek', () => {
    assert.throws(
      () =>
        resolveModelApiSurface({
          VOLTAGENT_MODEL_PROVIDER: 'deepseek',
          VOLTAGENT_MODEL_API: 'responses',
        }),
      /DeepSeek.*Chat Completions/,
    )
  })

  it('allows Responses API for an explicit OpenAI provider', () => {
    assert.equal(
      resolveModelApiSurface({
        VOLTAGENT_MODEL_PROVIDER: 'openai',
        VOLTAGENT_MODEL_API: 'responses',
      }),
      'responses',
    )
  })
})

describe('DeepSeek multi-step tools', () => {
  it('passes reasoning_content back after a tool result', async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    const originalFetch = globalThis.fetch

    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      requestBodies.push(body)

      if (requestBodies.length === 1) {
        return jsonResponse({
          id: 'chatcmpl-step-1',
          object: 'chat.completion',
          created: 1,
          model: 'deepseek-v4-flash',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                reasoning_content: '先检查连接状态。',
                tool_calls: [
                  {
                    id: 'call_status',
                    type: 'function',
                    function: {
                      name: 'connector_status',
                      arguments: '{}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 5,
            total_tokens: 10,
          },
        })
      }

      const messages = body.messages as Array<Record<string, unknown>>
      const assistant = messages.find((message) => message.role === 'assistant')
      if (assistant?.reasoning_content !== '先检查连接状态。') {
        return jsonResponse(
          {
            error: {
              message:
                'The `reasoning_content` in the thinking mode must be passed back to the API.',
            },
          },
          400,
        )
      }

      return jsonResponse({
        id: 'chatcmpl-step-2',
        object: 'chat.completion',
        created: 2,
        model: 'deepseek-v4-flash',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '连接正常。',
              reasoning_content: '',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      })
    }

    try {
      const provider = createProvider({
        apiKey: 'test-key',
        baseURL: 'https://api.deepseek.test',
      })
      const result = await generateText({
        model: createLanguageModel(provider, 'deepseek-v4-flash'),
        prompt: '检查连接状态后回复。',
        tools: {
          connector_status: tool({
            description: 'Read connector status.',
            inputSchema: z.object({}),
            execute: async () => ({ connected: true }),
          }),
        },
        stopWhen: stepCountIs(2),
      })

      assert.equal(result.text, '连接正常。')
      assert.equal(requestBodies.length, 2)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
