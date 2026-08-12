/** Brand marks for Capability Surface chips / toolbar. */
import type { ImgHTMLAttributes, SVGProps } from 'react'
import type { ReactNode } from 'react'
import feishuAppIconUrl from '@/assets/connectors/feishu-app-icon.png'
import { cn } from '@/lib/utils'

/**
 * Official GitHub Primer Octicon `mark-github-16`.
 * Source: https://github.com/primer/octicons/blob/main/icons/mark-github-16.svg
 */
export function GitHubBrandIcon({
  className,
  title = 'GitHub',
  ...props
}: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 16 16'
      fill='currentColor'
      role='img'
      aria-label={title}
      data-brand-id='github'
      className={cn('size-4 shrink-0', className)}
      {...props}
    >
      <title>{title}</title>
      <path d='M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656' />
    </svg>
  )
}

/**
 * Official local Feishu/Lark desktop app icon.
 * Source: /Applications/Lark.app/Contents/Resources/app.icns
 * Bundle id: com.bytedance.macos.feishu (Feishu 7.47.15 at extraction time).
 */
export function FeishuBrandIcon({
  className,
  title = '飞书',
  alt,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { title?: string }) {
  return (
    <img
      src={feishuAppIconUrl}
      alt={alt ?? title}
      title={title}
      draggable={false}
      data-brand-id='feishu'
      className={cn('size-4 shrink-0 object-contain', className)}
      {...props}
    />
  )
}

/**
 * Resolve a brand icon from a package-contributed brandIconKey (#52).
 * Falls back to a first-letter monogram for unknown connectors — no
 * Provider id branching in Host or Renderer.
 */
export function renderBrandIcon(
  brandIconKey: string | undefined,
  name: string,
  className?: string,
): ReactNode {
  if (brandIconKey === 'github') {
    return <GitHubBrandIcon className={className} title={name} aria-hidden />
  }
  if (brandIconKey === 'feishu') {
    return <FeishuBrandIcon className={className} title={name} aria-hidden />
  }
  return (
    <span
      className={cn(
        'flex items-center justify-center font-semibold text-muted-foreground',
        className,
      )}
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
  )
}

/** WorkBuddy-style brand tile beside Composer「+」. */
export function ConnectorBrandBadge({
  brandIconKey,
  connectorId,
  name,
  connected,
  selected,
  onClick,
  onRemove,
  className,
}: {
  brandIconKey?: string
  connectorId: string
  name: string
  connected?: boolean
  selected?: boolean
  onClick?: () => void
  onRemove?: () => void
  className?: string
}) {
  const label = connected ? name : `${name}（未连接）`
  return (
    <span
      className={cn('group/conn relative inline-flex shrink-0', className)}
      data-testid={`capability-toolbar-connector-${connectorId}`}
    >
      <button
        type='button'
        title={label}
        aria-label={label}
        data-connected={connected ? 'true' : 'false'}
        data-selected={selected ? 'true' : 'false'}
        onClick={onClick}
        className={cn(
          'inline-flex size-7 items-center justify-center rounded-[10px]',
          'bg-muted/35 ring-1 ring-border/40',
          'transition-colors hover:bg-[var(--wb-hover)] hover:ring-border/70',
          !connected && 'opacity-65',
        )}
      >
        {renderBrandIcon(brandIconKey, name, 'size-[18px] text-[11px]')}
      </button>
      {onRemove ? (
        <button
          type='button'
          aria-label={`移除 ${name}`}
          title={`移除 ${name}`}
          className={cn(
            'absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full',
            'bg-foreground text-[9px] leading-none text-background shadow-sm',
            'opacity-0 transition-opacity group-focus-within/conn:opacity-100 group-hover/conn:opacity-100',
          )}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          ×
        </button>
      ) : null}
    </span>
  )
}

/**
 * Resolve a brand icon node from brandIconKey (#52).
 * Kept for external consumers that render icons outside ConnectorBrandBadge.
 */
export function connectorBrandIconNode(
  brandIconKey: string | undefined,
  name: string,
): ReactNode {
  return renderBrandIcon(brandIconKey, name, 'size-4 text-[10px]')
}
