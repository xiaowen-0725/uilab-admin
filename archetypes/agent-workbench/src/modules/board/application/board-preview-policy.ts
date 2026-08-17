/**
 * Turn-scoped preview open policy (spec §9.4).
 * First commit in a Turn opens; later commits update; user close suppresses.
 */

export type BoardPreviewDecision = 'open' | 'update' | 'skip'

export class BoardPreviewPolicy {
  private turnId: string | null = null
  private taskId: string | null = null
  private opened = false
  private closedByUser = false

  onTurn(turnId: string, taskId?: string): void {
    const turn = turnId.trim()
    const task = taskId?.trim() || null
    if (!turn) return
    const sameTurn = turn === this.turnId
    const sameTask = task == null || task === this.taskId
    if (sameTurn && sameTask) return
    this.turnId = turn
    this.taskId = task ?? this.taskId
    this.opened = false
    this.closedByUser = false
  }

  onUserClose(): void {
    this.closedByUser = true
  }

  decide(turnId: string, taskId?: string): BoardPreviewDecision {
    this.onTurn(turnId, taskId)
    if (this.closedByUser) return 'skip'
    if (this.opened) return 'update'
    this.opened = true
    return 'open'
  }
}

export function createBoardPreviewPolicy(): BoardPreviewPolicy {
  return new BoardPreviewPolicy()
}
