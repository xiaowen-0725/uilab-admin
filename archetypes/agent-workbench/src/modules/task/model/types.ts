/** Task Module view types for static Phase 3 fixtures (no Runtime model). */

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
