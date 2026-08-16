import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { buildWidgetIframeCsp } from '../model/widget-subdocument-policy'
import { BoardWidgetFrame, readHostCspNonce } from './board-widget-frame'

function waitForWidgetMessage<T extends { type: string }>(
  type: T['type'],
  timeoutMs = 2000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error(`timed out waiting for ${type}`))
    }, timeoutMs)
    function onMessage(event: MessageEvent) {
      if (!event.data || event.data.type !== type) return
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      resolve(event.data as T)
    }
    window.addEventListener('message', onMessage)
  })
}

function probeSrcDoc(nonce: string, body: string): string {
  return `<!doctype html><script nonce="${nonce}">${body}</script>`
}

describe('BoardWidgetFrame', () => {
  it('pairs sandbox and csp on the widget iframe', async () => {
    const nonce = readHostCspNonce()
    await render(<BoardWidgetFrame srcDoc="<!doctype html><p>ok</p>" />)
    const iframe = page.getByTestId('board-widget-frame').element()
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(iframe.getAttribute('csp')).toBe(buildWidgetIframeCsp(nonce))
  })

  it('loads about:srcdoc and runs a nonce script under the host policy', async () => {
    const nonce = readHostCspNonce()
    const ready = waitForWidgetMessage<{ type: string; href: string }>(
      'board-widget-ready',
    )
    await render(
      <BoardWidgetFrame
        srcDoc={probeSrcDoc(
          nonce,
          `parent.postMessage({type:'board-widget-ready',href:String(location.href)},'*')`,
        )}
      />,
    )
    const message = await ready
    expect(message.href).toMatch(/srcdoc|about:srcdoc/i)
  })

  it('blocks widget self-navigation to https://example.com', async () => {
    const nonce = readHostCspNonce()
    const result = waitForWidgetMessage<{ type: string; href: string }>(
      'board-widget-nav',
    )
    await render(
      <BoardWidgetFrame
        srcDoc={probeSrcDoc(
          nonce,
          `try{location='https://example.com'}catch(e){}
           setTimeout(function(){
             parent.postMessage({type:'board-widget-nav',href:String(location.href)},'*')
           },80)`,
        )}
      />,
    )
    const message = await result
    expect(message.href).not.toContain('example.com')
    expect(message.href).toMatch(/srcdoc|about:srcdoc/i)
  })

  it('records whether host frame-src alone blocks srcdoc self-navigation', async () => {
    const nonce = readHostCspNonce()
    const result = waitForWidgetMessage<{ type: string; href: string }>(
      'board-host-frame-src-nav',
    )
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.srcdoc = probeSrcDoc(
      nonce,
      `try{location='https://example.com'}catch(e){}
       setTimeout(function(){
         parent.postMessage({type:'board-host-frame-src-nav',href:String(location.href)},'*')
       },80)`,
    )
    document.body.appendChild(iframe)
    try {
      const message = await result
      expect(message.href).toBe('about:srcdoc')
    } finally {
      iframe.remove()
    }
  })

  it('enforces the widget csp= directive set', async () => {
    const nonce = readHostCspNonce()
    const result = waitForWidgetMessage<{
      type: string
      evalRan: boolean
      fetchOk: boolean
      imgOk: boolean
    }>('board-widget-csp-probe')
    await render(
      <BoardWidgetFrame
        srcDoc={probeSrcDoc(
          nonce,
          `const report={evalRan:false,fetchOk:false,imgOk:false}
           try{eval('1+1');report.evalRan=true}catch(e){}
           Promise.all([
             fetch('http://127.0.0.1:3141/workspace/info').then(function(){report.fetchOk=true}).catch(function(){}),
             new Promise(function(resolve){
               const img=new Image()
               img.onload=function(){report.imgOk=true;resolve()}
               img.onerror=function(){resolve()}
               img.src=new URL('favicon.svg',document.baseURI).href
               setTimeout(resolve,400)
             })
           ]).then(function(){
             parent.postMessage(Object.assign({type:'board-widget-csp-probe'},report),'*')
           })`,
        )}
      />,
    )
    const message = await result
    expect(message.evalRan).toBe(false)
    expect(message.fetchOk).toBe(false)
    expect(message.imgOk).toBe(false)
  })
})
