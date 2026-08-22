import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function OutlineIcon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox='0 0 16 16'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

/** 16-grid desktop chrome icons. Outline 1.5; new-task is the solid primary. */

export function SidebarToggleIcon(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <rect x='2.25' y='2.25' width='11.5' height='11.5' rx='2' />
      <path d='M6.25 2.25v11.5' />
    </OutlineIcon>
  )
}

export function NewTaskIcon(props: IconProps) {
  return (
    <svg viewBox='0 0 16 16' fill='currentColor' aria-hidden {...props}>
      <path
        fillRule='evenodd'
        d='M2.1 6.85c0-2.6 2.4-4.7 5.35-4.7s5.35 2.1 5.35 4.7-2.4 4.7-5.35 4.7c-.62 0-1.2-.1-1.74-.28l-2.58 1.28a.7.7 0 0 1-1-.79l.66-1.9A4.75 4.75 0 0 1 2.1 6.85Zm5.35-1.55a.7.7 0 0 1 .7.7v.95h.95a.7.7 0 0 1 0 1.4h-.95v.95a.7.7 0 1 1-1.4 0v-.95h-.95a.7.7 0 0 1 0-1.4h.95v-.95a.7.7 0 0 1 .7-.7Z'
      />
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <circle cx='6.75' cy='6.75' r='3.5' />
      <path d='M9.35 9.35 13.1 13.1' />
    </OutlineIcon>
  )
}

export function FilterIcon(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <path d='M3.25 4.15h9.5L9.55 8.05v3.7L6.45 13.1V8.05L3.25 4.15Z' />
    </OutlineIcon>
  )
}

export function BellIcon(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <path d='M8 2.75c-2.1 0-3.75 1.55-3.75 3.7v1.85c0 .55-.22 1.1-.7 1.55L2.75 10.7h10.5l-.8-.85c-.48-.45-.7-1-.7-1.55V6.45c0-2.15-1.65-3.7-3.75-3.7Z' />
      <path d='M6.6 12.4a1.5 1.5 0 0 0 2.8 0' />
    </OutlineIcon>
  )
}

export function SettingsHexIcon(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <path d='M8 2.15 13.15 5.1v5.8L8 13.85 2.85 10.9V5.1Z' />
      <circle cx='8' cy='8' r='1.45' />
    </OutlineIcon>
  )
}

export function PaletteIcon(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <path d='M3.35 9.55c0-3.05 2.2-6.2 5-6.2.95 0 1.4 1.1 2.15 1.1.65 0 1.1-.9 2-.9 1.65 0 2.8 2.25 2.8 4.55 0 2.25-1.8 3.85-4.05 3.85H6.85c-2.1 0-3.5-1.05-3.5-2.4Z' />
      <circle cx='6.15' cy='7.15' r='.55' fill='currentColor' stroke='none' />
      <circle cx='8.2' cy='6.25' r='.55' fill='currentColor' stroke='none' />
      <circle cx='10.25' cy='7.35' r='.55' fill='currentColor' stroke='none' />
    </OutlineIcon>
  )
}

export function HelpCircleIcon(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <circle cx='8' cy='8' r='5.4' />
      <path d='M6.7 6.2c.15-.9.85-1.45 1.7-1.45.9 0 1.55.55 1.55 1.4 0 .7-.4 1.1-1.05 1.45-.55.3-.85.65-.85 1.3' />
      <circle cx='8' cy='11.15' r='.55' fill='currentColor' stroke='none' />
    </OutlineIcon>
  )
}

export function UpdateCircleIcon(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <circle cx='8' cy='8' r='5.4' />
      <path d='M8 10.35V6.15M6.2 7.8 8 6 9.8 7.8' />
    </OutlineIcon>
  )
}

export function SignOutIcon(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <rect x='2.4' y='3.2' width='6.6' height='9.6' rx='1.2' />
      <path d='M8.2 8h5.2M11.35 6.15 13.4 8l-2.05 1.85' />
    </OutlineIcon>
  )
}

export function FolderIcon(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <path d='M2.35 4.85h3.05l1.15 1.35h7.1c.6 0 1.1.5 1.1 1.1v5.1c0 .6-.5 1.1-1.1 1.1H2.35c-.6 0-1.1-.5-1.1-1.1V5.95c0-.6.5-1.1 1.1-1.1Z' />
    </OutlineIcon>
  )
}
