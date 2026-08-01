import { z } from 'zod'

export const __domainItem__Schema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  label: z.string(),
})

export type __DomainItem__ = z.infer<typeof __domainItem__Schema>
