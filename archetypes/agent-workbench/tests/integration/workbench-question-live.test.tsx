/**
 * Live Question Request smoke. Default `pnpm test` skips unless
 * VITE_WORKBENCH_LIVE_RUNTIME=1 and the sidecar is reachable.
 * Live: `pnpm dev:workbench-runtime` then `pnpm --filter @uilab/agent-workbench test:live-runtime`.
 */
import { WorkbenchApp } from '@/app/composition/workbench-app'
import { resolveVoltAgentBaseUrl } from '@/config/runtime-adapter'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

const LIVE_SIDECAR_PROBE_MS = 2000
const QUESTION_CARD_TIMEOUT_MS = 180_000
const CONTINUE_TIMEOUT_MS = 180_000
const LIVE_RUNTIME_SLICE_HOWTO =
  '完整 Runtime 切片：先 pnpm dev:workbench-runtime，再 pnpm --filter @uilab/agent-workbench test:live-runtime。'

const LIVE_QUESTION_PROMPT =
  '请立刻调用 ask_user_question 问我一个中文单选题来测试提问能力。只问这一题，不要先解释。选项至少两个。'

function isLiveRuntimeSliceRequested(): boolean {
  const flag = String(import.meta.env.VITE_WORKBENCH_LIVE_RUNTIME ?? '')
    .trim()
    .toLowerCase()
  return flag === '1' || flag === 'true'
}

async function isVoltAgentSidecarReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${resolveVoltAgentBaseUrl()}/workspace/info`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(LIVE_SIDECAR_PROBE_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

async function waitBooted() {
  await expect
    .element(page.getByTestId('workbench-shell'))
    .toBeInTheDocument()
}

async function openNewChat() {
  await userEvent.click(page.getByTestId('navigator-new-chat'))
  await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
  await expect
    .element(page.getByTestId('composer'))
    .toHaveAttribute('data-composer-mode', 'runtime')
}

describe('Workbench Question Request live sidecar', () => {
  it('asks one question, accepts a card answer, then continues', async ({
    skip,
  }) => {
    skip(
      !isLiveRuntimeSliceRequested(),
      `默认套件不跑真侧车 submit。${LIVE_RUNTIME_SLICE_HOWTO}`,
    )
    skip(
      !(await isVoltAgentSidecarReachable()),
      `本机 VoltAgent 侧车不可达。${LIVE_RUNTIME_SLICE_HOWTO}`,
    )

    await render(<WorkbenchApp persistence='memory' />)
    await waitBooted()
    await openNewChat()

    await userEvent.fill(page.getByTestId('composer-input'), LIVE_QUESTION_PROMPT)
    await userEvent.click(page.getByTestId('composer-submit'))

    await expect
      .element(page.getByTestId('question-skip'), {
        timeout: QUESTION_CARD_TIMEOUT_MS,
      })
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('composer-input'))
      .toHaveAttribute('placeholder', '或直接回复…')

    const firstOption = document.querySelector(
      '[data-testid^="question-option-"]',
    )
    expect(firstOption).toBeTruthy()
    await userEvent.click(firstOption as HTMLElement)

    await expect
      .poll(
        () =>
          document.querySelector(
            '[data-category="input-request"][data-status="provided"]',
          ) != null,
        { timeout: 15_000 },
      )
      .toBe(true)

    await expect
      .poll(
        () =>
          document.querySelectorAll('[data-category="assistant-message"]')
            .length >= 1,
        { timeout: CONTINUE_TIMEOUT_MS },
      )
      .toBe(true)
  })
})
