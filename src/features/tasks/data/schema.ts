import { z } from "zod"

export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["todo", "in-progress", "done", "canceled"]),
  priority: z.enum(["low", "medium", "high"]),
  label: z.enum(["bug", "feature", "documentation"]),
})

export type Task = z.infer<typeof taskSchema>
