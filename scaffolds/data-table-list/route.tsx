import { createFileRoute } from '@tanstack/react-router'
import { __Domain__ } from '@/features/__domain__'

export const Route = createFileRoute('/_authenticated/__domain__/')({
  component: __Domain__,
})
