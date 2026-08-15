/** Task Module view types for static fixtures / capture replay (no live Runtime). */

export interface ExecutionItem {
  id: string
  kind: 'user' | 'assistant' | 'tool'
  title?: string
  body: string
  /** tool activity is always completed in the static fixture */
  status?: 'completed'
}

export interface ContextSection {
  id: string
  title: string
  items: string[]
}

/** Empty-hub action card (fixture-honest; not Runtime). */
export interface LaunchAction {
  id: string
  label: string
  /** Prompt stub inserted / used to open a capture stream. */
  promptStub: string
  /** Optional capture to load when the card is activated. */
  captureId?: string
  icon: 'explore' | 'build' | 'review' | 'fix'
}

/** empty = hub, stream = capture-projected Timeline, runtime = VoltAgent Timeline */
export type TaskContentMode = 'empty' | 'stream' | 'runtime'
