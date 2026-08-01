import { useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

type GeneralErrorProps = {
  error?: Error
  reset?: () => void
}

export function GeneralError({ error }: GeneralErrorProps) {
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <h1 className='text-[7rem] leading-tight font-bold'>500</h1>
        <span className='font-medium'>服务器错误</span>
        <p className='max-w-md text-center text-muted-foreground'>
          {error?.message || '页面渲染时发生未知错误。'}
        </p>
        <div className='mt-6 flex gap-4'>
          <Button variant='outline' onClick={() => history.go(-1)}>
            返回上一页
          </Button>
          <Button onClick={() => navigate({ to: '/' })}>回到首页</Button>
        </div>
      </div>
    </div>
  )
}
