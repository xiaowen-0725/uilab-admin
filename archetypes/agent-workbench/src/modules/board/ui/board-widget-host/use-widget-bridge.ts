import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createWidgetNonce,
  WIDGET_HANDSHAKE,
  WIDGET_HEARTBEAT_MS,
  WIDGET_READY_TIMEOUT_MS,
  WIDGET_STALE_MS,
  type WidgetInboundMessage,
  type WidgetOutboundMessage,
  type WidgetTheme,
} from '../../model/widget-document'

export type WidgetPhase = 'mounting' | 'ready' | 'failed' | 'stale'

export interface WidgetBridgeOptions {
  data: unknown
  theme: WidgetTheme
  input?: unknown
  onSaveInput?: (input: unknown) => void
  onSubmit?: (payload: unknown) => void
  onOpenLink?: (href: string) => void
  /** Milliseconds from host mount to the widget's own ready signal. */
  onReady?: (elapsedMs: number) => void
}

export interface WidgetBridge {
  phase: WidgetPhase
  error: string | null
  /** Widget-reported content height, for overflow hints. */
  contentHeight: number | null
  nonce: string
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  onIframeLoad: () => void
  /** New nonce + fresh document: the only way to re-run widget code. */
  reload: () => void
}

/**
 * Host side of the widget bridge: MessageChannel handshake over the opaque
 * origin, then a private port for data/theme/liveness.
 *
 * Liveness is a self-made heartbeat because `MessagePort` has no close event —
 * a widget stuck in a loop keeps its port alive, so silence is the only signal
 * we get.
 */
export function useWidgetBridge(options: WidgetBridgeOptions): WidgetBridge {
  const { data, theme, input, onSaveInput, onSubmit, onOpenLink, onReady } =
    options

  const [reloadToken, setReloadToken] = useState(0)
  const [nonce, setNonce] = useState(createWidgetNonce)
  const [phase, setPhase] = useState<WidgetPhase>('mounting')
  const [error, setError] = useState<string | null>(null)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const [open, setOpen] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const portRef = useRef<MessagePort | null>(null)
  const mountedAtRef = useRef(performance.now())
  const lastBeatRef = useRef(0)
  // An error survives the `ready` that follows it: a widget that threw during
  // startup is broken even though it finished loading.
  const failedRef = useRef(false)
  const sentDataRef = useRef<unknown>(undefined)
  const sentThemeRef = useRef<WidgetTheme | null>(null)

  // Latest callbacks without re-running the handshake effect.
  const handlersRef = useRef({ onSaveInput, onSubmit, onOpenLink, onReady })
  handlersRef.current = { onSaveInput, onSubmit, onOpenLink, onReady }
  const initialRef = useRef({ data, theme, input })
  initialRef.current = { data, theme, input }

  const post = useCallback((message: WidgetInboundMessage) => {
    portRef.current?.postMessage(message)
  }, [])

  const onIframeLoad = useCallback(() => {
    const target = iframeRef.current?.contentWindow
    if (!target) return

    portRef.current?.close()
    const channel = new MessageChannel()
    portRef.current = channel.port1

    channel.port1.onmessage = (event: MessageEvent<WidgetOutboundMessage>) => {
      const message = event.data
      if (!message || typeof message.type !== 'string') return
      switch (message.type) {
        case 'ready': {
          lastBeatRef.current = performance.now()
          setContentHeight(message.height)
          setPhase(failedRef.current ? 'failed' : 'ready')
          handlersRef.current.onReady?.(
            performance.now() - mountedAtRef.current,
          )
          break
        }
        case 'resize': {
          setContentHeight(message.height)
          break
        }
        case 'heartbeat': {
          lastBeatRef.current = performance.now()
          setPhase((current) => (current === 'stale' ? 'ready' : current))
          break
        }
        case 'save-input': {
          handlersRef.current.onSaveInput?.(message.input)
          break
        }
        case 'submit': {
          handlersRef.current.onSubmit?.(message.payload)
          break
        }
        case 'open-link': {
          handlersRef.current.onOpenLink?.(message.href)
          break
        }
        case 'error': {
          failedRef.current = true
          setError(message.message)
          setPhase('failed')
          break
        }
      }
    }

    const initial = initialRef.current
    sentDataRef.current = initial.data
    sentThemeRef.current = initial.theme
    // Opaque origin: '*' is the only usable target, and the transferred port is
    // what keeps the channel private afterwards.
    target.postMessage({ type: WIDGET_HANDSHAKE }, '*', [channel.port2])
    post({
      type: 'init',
      data: initial.data,
      theme: initial.theme,
      input: initial.input ?? null,
    })
    setOpen(true)
  }, [post])

  const reload = useCallback(() => {
    portRef.current?.close()
    portRef.current = null
    failedRef.current = false
    sentDataRef.current = undefined
    sentThemeRef.current = null
    mountedAtRef.current = performance.now()
    setOpen(false)
    setNonce(createWidgetNonce())
    setPhase('mounting')
    setError(null)
    setContentHeight(null)
    setReloadToken((token) => token + 1)
  }, [])

  useEffect(() => {
    return () => {
      portRef.current?.close()
      portRef.current = null
    }
  }, [])

  // A widget that never signals ready is a failure, not an eternal spinner.
  useEffect(() => {
    if (phase !== 'mounting') return
    const timer = window.setTimeout(() => {
      setPhase((current) => (current === 'mounting' ? 'failed' : current))
      setError((current) => current ?? '小组件未在预期时间内就绪。')
    }, WIDGET_READY_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [phase, reloadToken])

  useEffect(() => {
    if (phase !== 'ready' && phase !== 'stale') return
    const timer = window.setInterval(() => {
      if (performance.now() - lastBeatRef.current > WIDGET_STALE_MS) {
        setPhase((current) => (current === 'ready' ? 'stale' : current))
      }
    }, WIDGET_HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [phase])

  // Data and theme travel as soon as the port exists, deliberately not gated on
  // phase: a widget that failed at startup must still receive a fresh payload,
  // which is the only way a failed refresh can recover without a reload.
  useEffect(() => {
    if (!open) return
    if (Object.is(data, sentDataRef.current)) return
    sentDataRef.current = data
    failedRef.current = false
    setError(null)
    setPhase((current) => (current === 'failed' ? 'ready' : current))
    post({ type: 'data', data, dataState: 'ready' })
  }, [data, open, post])

  useEffect(() => {
    if (!open) return
    if (sentThemeRef.current === theme) return
    sentThemeRef.current = theme
    post({ type: 'theme', theme })
  }, [theme, open, post])

  return {
    phase,
    error,
    contentHeight,
    nonce,
    iframeRef,
    onIframeLoad,
    reload,
  }
}
