/**
 * Live Plan smoke (#101). Default `pnpm test` skips unless the sidecar is up.
 * Live: `pnpm dev:workbench-runtime` then `pnpm --filter @uilab/agent-workbench test:live-runtime`.
 */
import { WorkbenchApp } from '@/app/composition/workbench-app'
import { resolveVoltAgentBaseUrl } from '@/config/runtime-adapter'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

const LIVE_SIDECAR_PROBE_MS = 2000
const LIVE_PLAN_TIMEOUT_MS = 180_000
const LIVE_RUNTIME_SLICE_HOWTO =
  '完整 Runtime 切片：先 pnpm dev:workbench-runtime，再 pnpm --filter @uilab/agent-workbench test:live-runtime。'

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
          { timeout: LIVE_PLAN_TIMEOUT_MS - 10_000 },
        )
        .toBeGreaterThanOrEqual(2)

      await expect
        .element(page.getByTestId('context-panel-plan-progress'))
        .toHaveTextContent(/\d+\/\d+/)
      expect(
        document.querySelector('[data-testid="context-panel-plan-empty"]'),
      ).toBeNull()

      const statuses = [
        ...document.querySelectorAll('[data-testid="context-panel-plan-step"]'),
      ].map((el) => el.getAttribute('data-status'))
      expect(
        statuses.some((status) => status === 'in_progress' || status === 'completed'),
      ).toBe(true)

      await expect
        .poll(
          () => document.querySelectorAll('[data-category="plan-update"]').length,
          { timeout: 30_000 },
        )
        .toBeGreaterThanOrEqual(1)

      const toolText = [
        ...document.querySelectorAll('[data-category="tool-group"]'),
      ]
        .map((el) => el.textContent ?? '')
        .join('\n')
      expect(toolText).not.toMatch(/update_plan/)

      await expect
        .element(page.getByTestId('timeline-run-status-label'))
        .toHaveTextContent('个动作')
      expect(
        page.getByTestId('timeline-run-status-label').element().textContent ?? '',
      ).not.toMatch(/步/)
    },
  )
})
