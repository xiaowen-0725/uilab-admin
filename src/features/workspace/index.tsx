import { Bot, PanelRight, Play, Plus, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

const recentThreads = [
  {
    id: 'THR-1001',
    title: '梳理工单列表筛选交互',
    status: '进行中',
  },
  {
    id: 'THR-1002',
    title: '补齐设置页中文文案',
    status: '待办',
  },
  {
    id: 'THR-1003',
    title: '桌面 host 接入清单',
    status: '已完成',
  },
]

export function Workspace() {
  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div>
            <div className='mb-1 flex items-center gap-2'>
              <Badge variant='secondary'>Agent Desktop</Badge>
              <Badge variant='outline'>L1 + L2 host-ready</Badge>
            </div>
            <h1 className='text-2xl font-bold tracking-tight'>工作区</h1>
            <p className='text-muted-foreground'>
              Agent
              主画布占位：会话上下文、提示输入与结果面板。后续可接真实模型与桌面
              host。
            </p>
          </div>
          <div className='flex gap-2'>
            <Button>
              <Plus className='size-4' />
              新建会话
            </Button>
          </div>
        </div>

        <div className='grid flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]'>
          <Card className='h-full'>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base'>最近会话</CardTitle>
              <CardDescription>来自 threads 模式的轻量入口</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {recentThreads.map((thread) => (
                <button
                  key={thread.id}
                  type='button'
                  className='w-full rounded-lg border p-3 text-start transition-colors hover:bg-muted/50'
                >
                  <div className='mb-1 flex items-center justify-between gap-2'>
                    <span className='font-medium'>{thread.id}</span>
                    <Badge variant='outline'>{thread.status}</Badge>
                  </div>
                  <p className='line-clamp-2 text-sm text-muted-foreground'>
                    {thread.title}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className='flex h-full min-h-125 flex-col'>
            <CardHeader className='pb-3'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Bot className='size-4' />
                主画布
              </CardTitle>
              <CardDescription>
                这里放对话流、工具调用轨迹或文件预览。当前是可运行占位。
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-1 flex-col gap-3'>
              <div className='flex flex-1 flex-col gap-3 rounded-xl border bg-muted/20 p-4'>
                <div className='rounded-lg border bg-background p-3 text-sm'>
                  <div className='mb-1 font-medium'>系统</div>
                  <p className='text-muted-foreground'>
                    已进入 agent-desktop 工作区。可从右侧检查桌面 host
                    边界，或打开会话列表管理线程。
                  </p>
                </div>
                <div className='rounded-lg border bg-background p-3 text-sm'>
                  <div className='mb-1 font-medium'>助手</div>
                  <p className='text-muted-foreground'>
                    下一步建议：把真实 Agent runtime 接到此画布，并把 threads
                    列表替换为后端数据源。
                  </p>
                </div>
              </div>

              <div className='space-y-2'>
                <Textarea
                  placeholder='输入给 Agent 的任务或问题…'
                  className='min-h-24'
                  defaultValue='帮我把会话列表接到本地 SQLite，并保留 data-table 筛选。'
                />
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                    <Sparkles className='size-3.5' />
                    示例提示，不会真实调用模型
                  </div>
                  <Button>
                    <Play className='size-4' />
                    运行
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className='h-full'>
            <CardHeader className='pb-3'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <PanelRight className='size-4' />
                上下文
              </CardTitle>
              <CardDescription>模型、工具与 host 状态</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <div className='rounded-lg border p-3'>
                <div className='mb-1 font-medium'>Runtime</div>
                <p className='text-muted-foreground'>Web renderer（Vite）</p>
              </div>
              <div className='rounded-lg border p-3'>
                <div className='mb-1 font-medium'>Desktop host</div>
                <p className='text-muted-foreground'>
                  L2 ready：见 `desktop/README.md`，尚未接入 Electron/Tauri。
                </p>
              </div>
              <div className='rounded-lg border p-3'>
                <div className='mb-1 font-medium'>推荐下一步</div>
                <ul className='list-disc space-y-1 ps-4 text-muted-foreground'>
                  <li>替换 threads mock 数据</li>
                  <li>接入真实 Agent 流式输出</li>
                  <li>经 bridge 暴露文件系统/窗口能力</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}
