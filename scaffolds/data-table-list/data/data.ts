import { type __DomainItem__ } from './schema'

export const statuses = [
  { label: '待办', value: 'todo' },
  { label: '进行中', value: 'in_progress' },
  { label: '已完成', value: 'done' },
  { label: '已取消', value: 'canceled' },
] as const

export const __domain__Items: __DomainItem__[] = [
  {
    id: '__DOMAIN__-1001',
    title: '示例条目 A',
    status: 'todo',
    label: '示例',
  },
  {
    id: '__DOMAIN__-1002',
    title: '示例条目 B',
    status: 'in_progress',
    label: '示例',
  },
  {
    id: '__DOMAIN__-1003',
    title: '示例条目 C',
    status: 'done',
    label: '示例',
  },
]
