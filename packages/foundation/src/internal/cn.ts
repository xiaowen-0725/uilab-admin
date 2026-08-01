import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Private class-merge helper — not part of the public Foundation Interface. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
