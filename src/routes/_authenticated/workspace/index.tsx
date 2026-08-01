import { createFileRoute } from '@tanstack/react-router'
import { Workspace } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/')({
  component: Workspace,
})
