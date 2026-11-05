/**
 * Playwright harness entry.
 *
 * Loads the real built `lib/client.js` the way the Harness does - through
 * `window.__ModuleLoader__` and a shared module table - then applies the plugin
 * against a recording slot registry and mounts the panel it registers. Whatever
 * the panel does here is what it does in the Harness, minus the Harness chrome.
 */
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'

interface LoaderRow {
  id: string
  factory: (require: (specifier: string) => unknown) => unknown
}

declare global {
  interface Window {
    __ASK_ROW__?: LoaderRow
    __ASK_PROBE__?: Record<string, unknown>
    __ASK_READY__?: boolean
  }
}

const shared: Record<string, unknown> = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  'react-dom': ReactDOM,
  'react-dom/client': ReactDOMClient,
}

const row = window.__ASK_ROW__
if (row === undefined) throw new Error('client.js never called window.__ModuleLoader__.load')

const requested: string[] = []
const plugin = row.factory((specifier: string) => {
  requested.push(specifier)
  const module = shared[specifier]
  if (module === undefined) throw new Error(`the harness module table cannot answer require(${specifier})`)
  return module
}) as { apply: (ctx: unknown) => void }

interface Registration {
  options: Record<string, unknown>
  component: React.ComponentType<Record<string, unknown>>
}
const registered: Registration[] = []
plugin.apply({
  slots: {
    register(options: Record<string, unknown>, component: Registration['component']) {
      registered.push({ options, component })
      return () => {}
    },
    inject(_name: string, callback: () => void) {
      callback()
    },
  },
})

const panel = registered.find((entry) => entry.options.name === 'main')
if (panel === undefined) throw new Error('the plugin registered no "main" panel')

window.__ASK_PROBE__ = { pluginId: row.id, requested, registered: registered.map((entry) => entry.options) }
ReactDOMClient.createRoot(document.getElementById('root')!).render(React.createElement(panel.component))
window.__ASK_READY__ = true