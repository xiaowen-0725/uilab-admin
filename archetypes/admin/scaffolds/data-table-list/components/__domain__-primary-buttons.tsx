import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function __Domain__PrimaryButtons() {
  return (
    <div className='flex gap-2'>
      <Button className='space-x-1'>
        <span>新建</span>
        <Plus size={18} />
      </Button>
    </div>
  )
}
