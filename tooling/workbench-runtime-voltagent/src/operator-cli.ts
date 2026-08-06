/**
 * Operator CLI — plugin list / doctor (#24).
 *
 * Usage:
 *   pnpm --filter @uilab/workbench-runtime-voltagent plugin:list
 *   pnpm --filter @uilab/workbench-runtime-voltagent plugin:doctor
 *   pnpm --filter @uilab/workbench-runtime-voltagent plugin:list -- --json
 *
 * Not an Agent tool surface. Never prints secret values.
 */

import { runPluginDoctor, runPluginList } from './plugin/operator.js'

function parseArgs(argv: string[]) {
  const json = argv.includes('--json')
  const cmd = argv.find((a) => a === 'list' || a === 'doctor') ?? 'list'
  return { json, cmd: cmd as 'list' | 'doctor' }
}

async function main() {
  const { json, cmd } = parseArgs(process.argv.slice(2))
  const env = process.env

  if (cmd === 'list') {
    const report = await runPluginList({ env })
    try {
      if (json) {
        process.stdout.write(`${JSON.stringify(report.json, null, 2)}\n`)
      } else {
        process.stdout.write(report.text)
      }
    } finally {
      await report.disconnect()
    }
    process.exit(0)
  }

  const report = await runPluginDoctor({ env })
  try {
    if (json) {
      process.stdout.write(`${JSON.stringify(report.json, null, 2)}\n`)
    } else {
      process.stdout.write(report.text)
      process.stdout.write(
        report.ok ? '\n医生检查：通过（无 warn/error）\n' : '\n医生检查：存在 warn/error，见上表\n',
      )
    }
  } finally {
    await report.disconnect()
  }
  process.exit(report.ok ? 0 : 1)
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`operator-cli 失败：${msg}\n`)
  process.exit(2)
})
