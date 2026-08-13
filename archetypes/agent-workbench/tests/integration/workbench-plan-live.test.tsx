/**
 * Live Plan smoke (#101). Default `pnpm test` skips unless
 * VITE_WORKBENCH_LIVE_RUNTIME=1 and the sidecar is reachable.
 * Live: `pnpm dev:workbench-runtime` then `pnpm --filter @uilab/agent-workbench test:live-runtime`.
 */
import { WorkbenchApp } from '@/app/composition/workbench-app'
import { resolveVoltAgentBaseUrl } from '@/config/runtime-adapter'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

const LIVE_SIDECAR_PROBE_MS = 2000
const LIVE_PLAN_TIMEOUT_MS = 200_000
const LIVE_PLAN_STEPS_TIMEOUT_MS = 170_000
const FOLD_APPEAR_TIMEOUT_MS = 15_000
const FOLD_OPEN_TIMEOUT_MS = 5_000
const PLAN_CARD_TIMEOUT_MS = 10_000
const LIVE_RUNTIME_SLICE_HOWTO =
  '完整 Runtime 切片：先 pnpm dev:workbench-runtime，再 pnpm --filter @uilab/agent-workbench test:live-runtime。'
const PLAN_TOOL_ROW_COPY = /正在更新计划|已更新计划|update_plan/

const LIVE_PLAN_PROMPT =
  '请先列出计划再执行，每完成一步立刻更新计划。只做只读两步：1) 列出工作区根目录有哪些文件；2) 阅读 README.md。计划步骤用中文短语，至少两步，开始时恰好一步进行中。不要写文件。'

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

function processFold(): Element | null {
  return document.querySelector('[data-kind="process-fold"]')
}

function isProcessFoldOpen(): boolean {
  return processFold()?.getAttribute('data-fold-open') === 'true'
}

async function ensureProcessFoldOpen() {
  await expect
    .poll(() => processFold() != null, { timeout: FOLD_APPEAR_TIMEOUT_MS })
    .toBe(true)
  if (isProcessFoldOpen()) return

  await userEvent.click(page.getByTestId('timeline-turn-toggle'))
  await expect
    .poll(isProcessFoldOpen, { timeout: FOLD_OPEN_TIMEOUT_MS })
    .toBe(true)
}

describe('Workbench Plan live sidecar', () => {
  it(
    'live sidecar: multi-stage task surfaces a plan snapshot without an update_plan tool row',
    { timeout: LIVE_PLAN_TIMEOUT_MS },
    async ({ skip }) => {
      skip(
        !isLiveRuntimeSliceRequested(),
        `默认套件不跑真侧车计划冒烟。${LIVE_RUNTIME_SLICE_HOWTO}`,
      )
      skip(
        !(await isVoltAgentSidecarReachable()),
        `本机 VoltAgent 侧车不可达。${LIVE_RUNTIME_SLICE_HOWTO}`,
      )

      await render(<WorkbenchApp persistence='memory' />)
      await waitBooted()
      await openNewChat()
      await userEvent.click(page.getByTestId('toggle-context'))

      await expect
        .element(page.getByTestId('context-panel-plan-empty'))
        .toHaveTextContent('本次任务暂无计划')

      await userEvent.fill(page.getByTestId('composer-input'), LIVE_PLAN_PROMPT)
      await userEvent.click(page.getByTestId('composer-submit'))

      await expect
        .poll(
          () => document.querySelectorAll('[data-testid="context-panel-plan-step"]').length,
          { timeout: LIVE_PLAN_STEPS_TIMEOUT_MS },
        )
        .toBeGreaterThanOrEqual(2)

      await expect
        .element(page.getByTestId('context-panel-plan-progress'))
        .toHaveTextContent(/\d+\/\d+/)
      expect(
        document.querySelector('[data-testid="context-panel-plan-empty"]'),
      ).toBeNull()

      const planSteps = document.querySelectorAll(
        '[data-testid="context-panel-plan-step"]',
      )
      expect(
        [...planSteps].some((step) => {
          const status = step.getAttribute('data-status')
          return status === 'in_progress' || status === 'completed'
        }),
      ).toBe(true)

      await ensureProcessFoldOpen()

      await expect
        .poll(
          () => document.querySelectorAll('[data-category="plan-update"]').length,
          { timeout: PLAN_CARD_TIMEOUT_MS },
        )
        .toBeGreaterThanOrEqual(1)

      const toolText = [
        ...document.querySelectorAll('[data-category="tool-group"]'),
      ]
        .map((el) => el.textContent ?? '')
        .join('\n')
      expect(toolText).not.toMatch(PLAN_TOOL_ROW_COPY)

      const runStatus = page.getByTestId('timeline-run-status-label')
      await expect.element(runStatus).toHaveTextContent('个动作')
      expect(runStatus.element().textContent ?? '').not.toMatch(/步/)
    },
  )
})
