/**
 * Composer chrome: two-tier「默认权限」dropdown.
 * Visual trigger reuses motion `ComposerAccessChip`; Base UI `render={...}`.
 */
import { ShieldCheck } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ComposerAccessChip } from '@/components/motion/agent-composer'
import {
  isPermissionPreset,
  permissionPresetLabel,
  PERMISSION_PRESET_OPTIONS,
  usePermissionPreset,
} from '../../application/permission-preset'

export interface ComposerPermissionPresetProps {
  taskId?: string | null
}

export function ComposerPermissionPreset({
  taskId,
}: ComposerPermissionPresetProps) {
  const { preset, setPreset } = usePermissionPreset(taskId)
  const label = permissionPresetLabel(preset)

  function handlePresetChange(value: string): void {
    if (isPermissionPreset(value)) setPreset(value)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ComposerAccessChip
            icon={<ShieldCheck className='size-4' />}
            tone={preset === 'full-access' ? 'warning' : 'default'}
            data-testid='composer-permission-preset'
            title='默认权限'
            aria-label={`默认权限：${label}`}
          />
        }
      >
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        side='top'
        sideOffset={8}
        className='w-72 p-1'
        data-testid='composer-permission-preset-menu'
      >
        <p className='px-1.5 py-1 text-xs font-medium text-muted-foreground'>
          默认权限
        </p>
        <DropdownMenuRadioGroup
          value={preset}
          onValueChange={handlePresetChange}
        >
          {PERMISSION_PRESET_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.id}
              value={option.id}
              className='items-start py-2'
              data-testid={`composer-permission-preset-${option.id}`}
            >
              <span className='flex min-w-0 flex-1 flex-col gap-0.5 pr-2'>
                <span>{option.label}</span>
                <span className='text-xs font-normal text-muted-foreground'>
                  {option.description}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
