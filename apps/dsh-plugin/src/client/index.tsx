/**
 * AskTree for the DeepSeek Harness - browser half.
 *
 * Contributes one full-page panel to the Harness Web GUI: the body goes into the
 * keyed `main` slot, and its icon into the `sidebar.panellist` list slot, using
 * the same id so the sidebar can select the panel through `ctx.layout`.
 *
 * The panel renders in the LIGHT DOM, deliberately. An earlier version mounted it
 * in a shadow root for CSS containment, and Chromium retargets
 * `window.getSelection()` nodes to the shadow host - so the app's own selection
 * handler (`container.contains(selection.anchorNode)`) never matched and the
 * floating "Ask" button, the product's core interaction, never appeared. KaTeX
 * offset mapping, Range/TreeWalker surgery, clipboard and file pickers are all
 * shadow-sensitive in the same way, so containment is solved on the stylesheet
 * side instead: `scripts/build.mjs` prefixes every app rule with the panel scope
 * class, which is what makes this file's root element safe to put in the document.
 *
 * @module asktree-dsh/client
 */
import { useEffect, useRef, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@asktree/web/App'
import SHEET from 'virtual:asktree-app-css'

/** Cordis services that must exist before `apply` runs. */
export const inject = ['slots', 'layout']

/** Id shared by the `main` panel registration and its `sidebar.panellist` icon. */
const PANEL_ID = 'asktree'

/** Attribute marking the one style element this plugin owns. */
const STYLE_ATTRIBUTE = 'data-asktree'

/**
 * Add the scoped app stylesheet to the document once. Every rule in it is
 * prefixed with the scope class, so it cannot reach Harness chrome, and the
 * shadow host's absence is what keeps the browser selection API honest.
 */
function ensureStyles(): void {
  if (document.head.querySelector(`style[${STYLE_ATTRIBUTE}="styles"]`) !== null) return
  const style = document.createElement('style')
  style.setAttribute(STYLE_ATTRIBUTE, 'styles')
  style.textContent = SHEET
  document.head.appendChild(style)
}

/**
 * Panel body: mounts the unmodified AskTree application.
 * @returns the scope root the app renders into.
 */
function AskTreePanel(): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const root = createRoot(host)
    root.render(<App />)
    return () => root.unmount()
  }, [])

  return <div ref={hostRef} className="asktree-dsh-scope" />
}

/**
 * Owner props the sidebar's global-panel row supplies to every rail icon
 * (`SidebarPanelIconOwnerProps` in the Harness client sidebar contract).
 */
interface PanelIconProps {
  /** Requested square edge in pixels. */
  readonly size?: number
  /** Whether this panel is the selected main panel. */
  readonly active?: boolean
}

/** Sidebar rail icon. The sidebar owns the click and the accessible name. */
function AskTreePanelIcon({ size = 16, active = false }: PanelIconProps): ReactElement {
  return (
    <span
      className="asktree-dsh-icon"
      data-active={active ? 'true' : 'false'}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="2.6" r="1.5" />
        <circle cx="3.6" cy="12" r="1.5" />
        <circle cx="12.4" cy="12" r="1.5" />
        <path d="M8 4.1v4.4" />
        <path d="M8 8.5 4.6 10.7" />
        <path d="M8 8.5l3.4 2.2" />
      </svg>
    </span>
  )
}

/**
 * Contribute the AskTree panel and its sidebar entry.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: any): void {
  ensureStyles()

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
  }, AskTreePanel))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    label: () => 'AskTree',
  }, AskTreePanelIcon))
}