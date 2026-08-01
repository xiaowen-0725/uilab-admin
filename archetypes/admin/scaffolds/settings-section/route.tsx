import { createFileRoute } from '@tanstack/react-router'
import { Settings__Section__ } from '@/features/settings/__section__'

export const Route = createFileRoute('/_authenticated/settings/__section__')({
  component: Settings__Section__,
})
