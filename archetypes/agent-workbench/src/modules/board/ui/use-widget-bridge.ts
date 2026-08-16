import { useCallback, useEffect, useRef, useState } from 'react'
import {
  WIDGET_HANDSHAKE_TYPE,
  WIDGET_HEARTBEAT_MISS_LIMIT,
  WIDGET_HEARTBEAT_MS,
  WIDGET_MESSAGE_MAX_BYTES,
  WIDGET_READY_RELOAD_LIMIT,
  WIDGET_READY_TIMEOUT_MS,
  createHandshakeToken,
  isAllowedOpenLink,
  messageByteLength,
  validateSaveInput,
  type HostToWidgetMessage,
  type WidgetTheme,
  type WidgetToHostMessage,
} from '../model/widget-document'

export type WidgetPhase = 'mounting' | 'ready' | 'failed' | 'dead'

export interface WidgetBridgeOptions {
  data: unknown
  theme: WidgetTheme
  inputs: Record<string, unknown>
  canSubmit: boolean
  heartbeat: boolean
  /** Changes when the srcdoc string is rebuilt so the bridge remounts with it. */
  documentKey: string
  onSaveInput?: (key: string, value: unknown) => void
  onSubmit?: (payload: unknown) => void
  onOpenLink?: (url: string) => void
  onWheelForward?: (deltaY: number) => void
  onReady?: (elapsedMs: number) => void
}

export interface WidgetBridge {
  phase: WidgetPhase
  error: string | null
  hint: string | null
  assignKey: number
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  onIframeLoad: () => void
  reload: () => void
}

export function useWidgetBridge(options: WidgetBridgeOptions): WidgetBridge {
  const {
    data,
    theme,
    inputs,
    canSubmit,
    heartbeat,
    documentKey,
    onSaveInput,
    onSubmit,
    onOpenLink,
    onWheelForward,
    onReady,
  } = options

  const [assignKey, setAssignKey] = useState(0)
  const [phase, setPhase] = useState<WidgetPhase>('mounting')
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [portOpen, setPortOpen] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const portRef = useRef<MessagePort | null>(null)
  const mountedAtRef = useRef(performance.now())
  const failedRef = useRef(false)
  const handshakeDoneRef = useRef(false)
  const reloadCountRef = useRef(0)
  const draftsRef = useRef<Record<string, unknown>>({ ...inputs })
  const sentDataRef = useRef<unknown>(undefined)
  const sentThemeRef = useRef<WidgetTheme | null>(null)
  const lastPongAtRef = useRef(0)

  const handlersRef = useRef({
    onSaveInput,
    onSubmit,
    onOpenLink,
    onWheelForward,
    onReady,
  })
  handlersRef.current = {
    onSaveInput,
    onSubmit,
    onOpenLink,
    onWheelForward,
    onReady,
  }
  const snapshotRef = useRef({ data, theme, inputs, canSubmit })
  snapshotRef.current = { data, theme, inputs, canSubmit }

  const post = useCallback((message: HostToWidgetMessage) => {
    if (messageByteLength(message) > WIDGET_MESSAGE_MAX_BYTES) return
    portRef.current?.postMessage(message)
  }, [])

  const showHint = useCallback((message: string, code: string) => {
    setHint(message)
    post({ type: 'hint', code, message })
  }, [post])

  const handleInbound = useCallback(
    (message: WidgetToHostMessage) => {
      if (!message || typeof message.type !== 'string') return
      if (messageByteLength(message) > WIDGET_MESSAGE_MAX_BYTES) {
        showHint('消息过大，已丢弃', 'message_too_large')
        return
      }

      switch (message.type) {
        case 'ready': {
          if (handshakeDoneRef.current) return
          handshakeDoneRef.current = true
          const snapshot = snapshotRef.current
          draftsRef.current = { ...snapshot.inputs }
          sentDataRef.current = snapshot.data
          sentThemeRef.current = snapshot.theme
          post({
            type: 'init',
            data: snapshot.data,
            theme: snapshot.theme,
            inputs: draftsRef.current,
            capabilities: { canSubmit: snapshot.canSubmit },
          })
          setPortOpen(true)
          return
        }
        case 'widget-ready': {
          if (failedRef.current) return
          setPhase('ready')
          handlersRef.current.onReady?.(performance.now() - mountedAtRef.current)
          return
        }
        case 'pong': {
          lastPongAtRef.current = performance.now()
          return
        }
        case 'save-input': {
          if (typeof message.key !== 'string') return
          const result = validateSaveInput(
            draftsRef.current,
            message.key,
            message.value,
          )
          if (!result.ok) {
            showHint(result.hint, result.code)
            return
          }
          draftsRef.current = {
            ...draftsRef.current,
            [message.key]: message.value,
          }
          handlersRef.current.onSaveInput?.(message.key, message.value)
          return
        }
        case 'submit': {
          if (!snapshotRef.current.canSubmit) return
          handlersRef.current.onSubmit?.(message.payload)
          return
        }
        case 'open-link': {
          if (!isAllowedOpenLink(message.url)) {
            showHint('只能打开 http 或 https 链接', 'open_link_rejected')
            return
          }
          handlersRef.current.onOpenLink?.(message.url)
          return
        }
        case 'wheel': {
          if (typeof message.deltaY !== 'number') return
          handlersRef.current.onWheelForward?.(message.deltaY)
          return
        }
        case 'error': {
          failedRef.current = true
          setError(message.message)
          setPhase('failed')
          return
        }
        case 'resize':
          return
        default:
          return
      }
    },
    [post, showHint],
  )

  const onIframeLoad = useCallback(() => {
    const iframe = iframeRef.current
    const target = iframe?.contentWindow
    if (!iframe || !target) return
    if (iframe.getAttribute('src') === 'about:blank') return

    portRef.current?.close()
    const channel = new MessageChannel()
    portRef.current = channel.port1
    handshakeDoneRef.current = false
    channel.port1.onmessage = (event: MessageEvent<WidgetToHostMessage>) => {
      handleInbound(event.data)
    }

    const token = createHandshakeToken()
    target.postMessage({ type: WIDGET_HANDSHAKE_TYPE, token }, '*', [
      channel.port2,
    ])
  }, [handleInbound])

  const resetBridge = useCallback((nextAssignKey: boolean) => {
    portRef.current?.close()
    portRef.current = null
    failedRef.current = false
    handshakeDoneRef.current = false
    sentDataRef.current = undefined
    sentThemeRef.current = null
    lastPongAtRef.current = 0
    mountedAtRef.current = performance.now()
    setPortOpen(false)
    setPhase('mounting')
    setError(null)
    setHint(null)
    if (nextAssignKey) setAssignKey((key) => key + 1)
  }, [])

  const reload = useCallback(() => {
    reloadCountRef.current = 0
    resetBridge(true)
  }, [resetBridge])

  useEffect(() => {
    return () => {
      portRef.current?.close()
      portRef.current = null
    }
  }, [])

  useEffect(() => {
    if (phase !== 'mounting') return
    const timer = window.setTimeout(() => {
      if (failedRef.current) return
      if (reloadCountRef.current < WIDGET_READY_RELOAD_LIMIT) {
        reloadCountRef.current += 1
        resetBridge(true)
        return
      }
      setPhase((current) => (current === 'mounting' ? 'failed' : current))
      setError((current) => current ?? '小组件未在预期时间内就绪。')
    }, WIDGET_READY_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [phase, assignKey, resetBridge])

  const documentKeyRef = useRef(documentKey)
  useEffect(() => {
    if (documentKeyRef.current === documentKey) return
    documentKeyRef.current = documentKey
    resetBridge(false)
  }, [documentKey, resetBridge])

  useEffect(() => {
    if (!heartbeat || !portOpen || phase !== 'ready') return
    lastPongAtRef.current = performance.now()
    const silenceLimit = WIDGET_HEARTBEAT_MS * WIDGET_HEARTBEAT_MISS_LIMIT

    const beat = () => {
      post({ type: 'ping' })
      if (performance.now() - lastPongAtRef.current < silenceLimit) return
      setPhase((current) => (current === 'ready' ? 'dead' : current))
      setError((current) => current ?? '小组件无响应。')
    }

    beat()
    const timer = window.setInterval(beat, WIDGET_HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [heartbeat, portOpen, phase, post])

  useEffect(() => {
    if (!portOpen) return
    if (Object.is(data, sentDataRef.current)) return
    sentDataRef.current = data
    post({ type: 'data', data })
  }, [data, portOpen, post])

  useEffect(() => {
    if (!portOpen) return
    if (sentThemeRef.current === theme) return
    sentThemeRef.current = theme
    post({ type: 'theme', theme })
  }, [theme, portOpen, post])

  return {
    phase,
    error,
    hint,
    assignKey,
    iframeRef,
    onIframeLoad,
    reload,
  }
}
