import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ExternalLink, RefreshCw } from 'lucide-react'
import type { BrowserHostPort } from '../../ports/browser-host-port'
import {
  normalizeBrowserUrl,
  sandboxForTrust,
  type BrowserUrlTrust,
} from './url-utils'

export type BrowserViewState =
  | 'loading'
  | 'ready'
  | 'load-failed'
  | 'blocked'
  | 'unsupported'

export interface BrowserPanelProps {
  resourceKey: string
  title: string
  host: BrowserHostPort
  /** Load timeout before load-failed (ms). */
  loadTimeoutMs?: number
}

const STATE_COPY: Record<BrowserViewState, string> = {
  loading: '正在加载页面…',
  ready: '',
  'load-failed': '页面加载失败。可刷新或使用系统浏览器打开。',
  blocked: '该地址被拦截，无法在工作区内预览。',
  unsupported: '不支持此地址类型（例如 file://）。请使用系统浏览器或其他入口。',
}

/**
 * Browser Surface body — sandboxed iframe + address + refresh + external open.
 * Not CDP / Computer Use / Desktop Host.
 */
export function BrowserPanel({
  resourceKey,
  title,
  host,
  loadTimeoutMs = 8000,
}: BrowserPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [state, setState] = useState<BrowserViewState>('loading')
  const [url, setUrl] = useState<string | null>(null)
  const [addressDraft, setAddressDraft] = useState(resourceKey)
  const [trust, setTrust] = useState<BrowserUrlTrust>('untrusted-url')
  const [reloadToken, setReloadToken] = useState(0)
  const [navKey, setNavKey] = useState(resourceKey)

  useEffect(() => {
    setAddressDraft(resourceKey)
    setNavKey(resourceKey)
  }, [resourceKey])

  useEffect(() => {
    const parsed = normalizeBrowserUrl(navKey)
    if (!parsed.ok) {
      setUrl(null)
      setState('unsupported')
      return
    }
    setUrl(parsed.url)
    setTrust(parsed.trust)
    setState('loading')
  }, [navKey, reloadToken])

  // Load timeout → load-failed (iframe onError is unreliable for network/XFO).
  useEffect(() => {
    if (!url || state !== 'loading') return
    const t = window.setTimeout(() => {
      setState((s) => (s === 'loading' ? 'load-failed' : s))
    }, loadTimeoutMs)
    return () => window.clearTimeout(t)
  }, [url, state, loadTimeoutMs, reloadToken])

  // Release iframe on unmount / resource change (A8).
  useEffect(() => {
    return () => {
      const iframe = iframeRef.current
      if (iframe) {
        try {
          iframe.src = 'about:blank'
        } catch {
          // ignore
        }
      }
    }
  }, [navKey])

  const onLoad = useCallback(() => {
    setState((s) => (s === 'unsupported' || s === 'blocked' ? s : 'ready'))
  }, [])

  const onRefresh = useCallback(() => {
    setReloadToken((n) => n + 1)
  }, [])

  const onNavigate = useCallback(() => {
    const parsed = normalizeBrowserUrl(addressDraft)
    if (!parsed.ok) {
      setState('unsupported')
      setUrl(null)
      return
    }
    setNavKey(parsed.url)
    setAddressDraft(parsed.url)
    setReloadToken((n) => n + 1)
  }, [addressDraft])

  const onOpenExternal = useCallback(async () => {
    if (!url) return
    await host.openExternal(url)
  }, [host, url])

  return (
    <div
      className='flex h-full min-h-0 flex-col gap-2'
      data-testid='work-surface-browser'
      data-resource-key={navKey}
      data-state={state}
      data-trust={trust}
      data-title={title}
    >
      <header className='flex shrink-0 flex-col gap-2 border-b border-border/60 pb-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <input
            className='min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-[12px] text-foreground'
            data-testid='browser-address'
            value={addressDraft}
            aria-label='地址'
            onChange={(e) => setAddressDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onNavigate()
              }
            }}
          />
          <Button
            type='button'
            size='sm'
            variant='outline'
            data-testid='browser-go'
            onClick={onNavigate}
          >
            前往
          </Button>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            data-testid='browser-back'
            disabled
            title='跨域预览时无法可靠后退'
          >
            后退
          </Button>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            data-testid='browser-forward'
            disabled
            title='跨域预览时无法可靠前进'
          >
            前进
          </Button>
          <Button
            type='button'
            size='sm'
            variant='outline'
            data-testid='browser-refresh'
            disabled={!url || state === 'unsupported'}
            onClick={onRefresh}
          >
            <RefreshCw className='size-3.5' aria-hidden />
            刷新
          </Button>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            data-testid='browser-open-external'
            disabled={!url || state === 'unsupported'}
            onClick={() => void onOpenExternal()}
          >
            <ExternalLink className='size-3.5' aria-hidden />
            系统浏览器打开
          </Button>
        </div>
      </header>

      {state !== 'ready' ? (
        <p
          className='text-sm text-muted-foreground'
          data-testid='browser-state-message'
          data-state={state}
        >
          {STATE_COPY[state]}
        </p>
      ) : null}

      {url && state !== 'unsupported' && state !== 'blocked' ? (
        <iframe
          key={`${url}:${reloadToken}`}
          ref={iframeRef}
          title={title || '浏览器预览'}
          src={url}
          sandbox={sandboxForTrust(trust)}
          referrerPolicy='no-referrer'
          className='min-h-0 w-full flex-1 rounded-md border border-border bg-background'
          data-testid='browser-iframe'
          onLoad={onLoad}
        />
      ) : null}

      <p className='text-[11px] text-muted-foreground'>
        受控预览 · 非 CDP / Computer Use / 独立浏览器配置 · 前进/后退跨域不可靠已禁用
      </p>
    </div>
  )
}
