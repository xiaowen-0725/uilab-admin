import { describe, expect, it } from 'vitest'
import {
  adminPreferenceDefaults,
  defaultSidebarOpen,
  resolveSidebarDefaultOpen,
} from './admin-preferences'

describe('defaultSidebarOpen', () => {
  it('is derived from project layout default', () => {
    expect(defaultSidebarOpen).toBe(
      adminPreferenceDefaults.layout === 'default'
    )
  })
})

describe('resolveSidebarDefaultOpen', () => {
  it('uses project default when cookie is absent', () => {
    expect(resolveSidebarDefaultOpen(undefined)).toBe(defaultSidebarOpen)
  })

  it('honors explicit true cookie', () => {
    expect(resolveSidebarDefaultOpen('true')).toBe(true)
  })

  it('honors explicit false cookie', () => {
    expect(resolveSidebarDefaultOpen('false')).toBe(false)
  })

  it('treats any non-false cookie value as open (legacy cookie semantics)', () => {
    expect(resolveSidebarDefaultOpen('1')).toBe(true)
    expect(resolveSidebarDefaultOpen('')).toBe(true)
  })
})
