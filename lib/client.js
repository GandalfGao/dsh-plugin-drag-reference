window.__ModuleLoader__.load({
  id: 'dsh-plugin-drag-reference',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')

    const NS = 'dsh-plugin-drag-reference'
    const STYLE_ID = NS + '/client.css'

    // Ghost pill + the global "we own the pointer" cursor. Tokens fall back to
    // literal colours so the plugin still looks sane if a token is renamed.
    const CSS = `
body.dsh-drag-ref-active, body.dsh-drag-ref-active * { cursor: grabbing !important; }
body.dsh-drag-ref-active { user-select: none !important; -webkit-user-select: none !important; }
.dsh-drag-ref-ghost {
  position: fixed; z-index: 2147483000; pointer-events: none; left: 0; top: 0;
  display: inline-flex; align-items: center; gap: 6px; max-width: 340px;
  padding: 5px 10px; border-radius: 8px;
  font: 500 12px/1.5 var(--dsw-font-family-base, system-ui, sans-serif);
  background: var(--dsw-alias-bg-module-platform, #1f1f1f);
  color: var(--dsw-alias-label-primary, #e8e8e8);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.14));
  box-shadow: 0 8px 28px rgba(0,0,0,.35);
  transform: translate(10px, 12px); opacity: .96; white-space: nowrap;
}
.dsh-drag-ref-ghost[data-over="true"] { border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dsh-drag-ref-ghost[data-over="true"] .dsh-drag-ref-hint { opacity: 1; }
.dsh-drag-ref-glyph { opacity: .85; }
.dsh-drag-ref-name { overflow: hidden; text-overflow: ellipsis; }
.dsh-drag-ref-hint { opacity: 0; color: var(--dsw-alias-brand-primary, #4d6bfe); transition: opacity .12s ease; }
.dsh-drag-ref-menu {
  position: fixed; z-index: 2147483001; min-width: 220px; max-width: 360px;
  padding: 4px; border-radius: 10px;
  font: 500 12px/1.5 var(--dsw-font-family-base, system-ui, sans-serif);
  background: var(--dsw-alias-bg-module-platform, #202020);
  color: var(--dsw-alias-label-primary, #e8e8e8);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.14));
  box-shadow: 0 10px 32px rgba(0,0,0,.38);
}
.dsh-drag-ref-menu-path {
  padding: 6px 8px; font-weight: 400; word-break: break-all; user-select: text;
  color: var(--dsw-alias-label-tertiary, #9a9a9a);
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.1));
  margin-bottom: 4px;
}
.dsh-drag-ref-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 7px 8px; border: none; border-radius: 7px;
  background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.dsh-drag-ref-menu-item:hover,
.dsh-drag-ref-menu-item:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08)); outline: none;
}
.dsh-drag-ref-menu-glyph { opacity: .85; }
`

    if (
      typeof document !== 'undefined' &&
      document.querySelector('style[data-plugin-css=' + JSON.stringify(STYLE_ID) + ']') === null
    ) {
      const tag = document.createElement('style')
      tag.dataset.plugin = NS
      tag.dataset.pluginCss = STYLE_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    /** Pointer travel before a press becomes a drag, in CSS pixels. */
    const THRESHOLD = 6

    /** Normalise Windows separators so mention grammar stays URI-shaped. */
    function normalizeSlashes(value) {
      return value.replace(/\\/gu, '/')
    }

    /** The basename of an absolute path. */
    function basename(path) {
      const clean = normalizeSlashes(path).replace(/\/+$/u, '')
      const at = clean.lastIndexOf('/')
      return at === -1 ? clean : clean.slice(at + 1)
    }

    /**
     * The tree row under a pointer target, or null.
     * The tab header also carries `data-files-path` (as `true`), so a row must
     * additionally sit inside `[data-files-body]` and name a real entry.
     */
    function rowUnder(target) {
      if (target === null || typeof target.closest !== 'function') return null
      const row = target.closest('[data-files-entry][data-files-path]')
      if (row === null) return null
      if (row.closest('[data-files-body]') === null) return null
      const entry = row.dataset.filesEntry
      if (entry !== 'file' && entry !== 'directory') return null
      const path = row.dataset.filesPath
      if (typeof path !== 'string' || path === '' || path === 'true') return null
      return row
    }

    /** The absolute workspace root the tree renders (its own `data-files-root`). */
    function workspaceRootOf(row) {
      const root = row.closest('[data-files-root]')
      const value = root === null ? null : root.getAttribute('data-files-root')
      return typeof value === 'string' ? value : ''
    }

    /** A workspace-relative path, falling back to the absolute one outside the root. */
    function relativeTo(path, root) {
      const absolute = normalizeSlashes(path)
      const base = normalizeSlashes(root).replace(/\/+$/u, '')
      if (base === '') return absolute
      if (absolute === base) return ''
      const head = absolute.slice(0, base.length + 1).toLowerCase()
      if (head === (base + '/').toLowerCase()) return absolute.slice(base.length + 1)
      return absolute
    }

    /**
     * The `@path` mention for one row, or null when the grammar cannot carry it.
     * Mirrors the product's own rules: workspace-relative inside the root,
     * absolute outside it, a trailing slash for directories, `@"…"` on
     * whitespace.
     */
    function mentionFor(path, root, directory) {
      let relative = relativeTo(path, root)
      if (relative === '') relative = normalizeSlashes(path)
      if (directory) relative = relative.replace(/\/+$/u, '') + '/'
      if (relative.includes('"') || relative === '' || relative === '/') return null
      return /\s/u.test(relative) ? '@"' + relative + '"' : '@' + relative
    }

    /** The composer region under a viewport point, with the Session it renders. */
    function composerUnder(x, y) {
      const element = document.elementFromPoint(x, y)
      if (element === null || typeof element.closest !== 'function') return null
      const region = element.closest('[data-conversation-region="composer"]')
      if (region === null) return null
      const owner = region.closest('[data-conversation-session]')
      return {
        region,
        session: owner === null ? null : owner.getAttribute('data-conversation-session'),
      }
    }

    /** Whether a drop target belongs to this dock's Session. */
    function belongsTo(target, sessionId) {
      return target.session === null || typeof sessionId !== 'string' || target.session === sessionId
    }

    /** Whether the draft already ends in whitespace (or is empty). */
    function draftEndsBlank() {
      const seat = document.querySelector('[data-conversation-region="composer"]')
      const editable = seat === null ? null : seat.querySelector('[contenteditable="true"]')
      const text = editable === null ? '' : (editable.textContent || '')
      return text === '' || /\s$/u.test(text)
    }

    /**
     * Insert one mention at the composer's captured caret as plain text.
     * The fallback path: used only when the reference-chip insertion is
     * unavailable, so a drop never silently does nothing.
     */
    function insertMention(inputActions, mention) {
      const span = inputActions.captureInsertion()
      const text = draftEndsBlank() ? mention + ' ' : ' ' + mention + ' '
      return inputActions.insertText(text, span) === true
    }

    /**
     * Insert a real reference chip through the same path the `@` completion
     * pick uses: the Session's input shell turns it into an atomic chip node
     * (glyph + label + trailing space) that serializes back to `@path` on send.
     * @returns whether the chip was inserted; false falls back to plain text.
     */
    function insertChip(sessions, sessionId, reference) {
      let shell = null
      try {
        const actx = sessions.scope(sessionId)
        const conversation = actx === undefined || actx === null ? null : actx.get('conversation')
        shell = conversation === undefined || conversation === null
          ? null
          : (conversation.input && conversation.input.for ? conversation.input.for(actx) : null)
      } catch {
        return false
      }
      if (shell === null) return false
      let applied = false
      try {
        applied = shell.addFiles([reference], []) === true
      } catch {
        applied = false
      }
      if (applied && typeof shell.focus === 'function') {
        try {
          // The chip lands at the stored caret; hand the keyboard back so the
          // user can keep typing (the shell's own focus preserves selection).
          shell.focus()
        } catch {
          /* focus is a nicety */
        }
      }
      return applied
    }

    /**
     * Resolve one row into the two insertion forms the composer accepts: the
     * reference-chip payload and the plain `@path` text.
     * @returns `{ mention, reference }`, or null when the grammar cannot carry
     *   this path (an embedded double quote).
     */
    function insertionFor(path, root, directory) {
      const mention = mentionFor(path, root, directory)
      if (mention === null) return null
      return {
        mention,
        reference: {
          source: 'reference',
          ref: mention,
          label: basename(path) + (directory ? '/' : ''),
          appearance: directory ? 'folder' : 'file',
          clipboardText: mention,
        },
      }
    }

    /** Build the drag ghost and resolve the chip + text forms once, at drag start. */
    function beginDrag(row) {
      const path = row.dataset.filesPath
      const directory = row.dataset.filesEntry === 'directory'
      const ghost = document.createElement('div')
      ghost.className = 'dsh-drag-ref-ghost'
      ghost.dataset.over = 'false'
      const glyph = document.createElement('span')
      glyph.className = 'dsh-drag-ref-glyph'
      glyph.textContent = directory ? '📁' : '📄'
      const name = document.createElement('span')
      name.className = 'dsh-drag-ref-name'
      name.textContent = basename(path) + (directory ? '/' : '')
      const hint = document.createElement('span')
      hint.className = 'dsh-drag-ref-hint'
      hint.textContent = '→ @'
      ghost.append(glyph, name, hint)
      document.body.append(ghost)
      const insertion = insertionFor(path, workspaceRootOf(row), directory)
      return {
        ghost,
        mention: insertion === null ? null : insertion.mention,
        reference: insertion === null ? null : insertion.reference,
      }
    }

    /** Keep the ghost beside the pointer. */
    function moveGhost(drag, x, y) {
      drag.ghost.style.left = x + 'px'
      drag.ghost.style.top = y + 'px'
    }

    /**
     * The invisible dock entry: it renders nothing, exists only to receive the
     * Session-bound `inputActions` prop, and owns the pointer drag.
     */
    function DragReferenceDock(props) {
      const sessionId = props.dragReferenceSessionId
      const inputActions = props.inputActions
      const insertDragReference = props.insertDragReference

      react.useEffect(() => {
        if (inputActions === void 0 || inputActions === null) {
          console.warn('[drag-reference] inputActions unavailable; the composer cannot receive @path drops')
          return
        }
        if (typeof document === 'undefined') return

        let pending = null
        let drag = null
        let swallowClick = false
        let swallowTimer = 0

        const endDrag = () => {
          if (drag !== null) {
            drag.ghost.remove()
            document.body.classList.remove('dsh-drag-ref-active')
          }
          drag = null
          pending = null
        }

        /**
         * Turn the release into a chip when the Session input shell accepts
         * one, otherwise fall back to the plain `@path` text.
         * @returns whether the composer changed.
         */
        const drop = (live) => {
          if (live.reference !== null) {
            let chipped = false
            try {
              chipped = insertDragReference(live.reference) === true
            } catch {
              chipped = false
            }
            if (chipped) return true
            console.warn('[drag-reference] reference chip refused; falling back to plain @path text')
          }
          return live.mention !== null && insertMention(inputActions, live.mention)
        }

        /** The open row menu, or null. */
        let menu = null

        const closeMenu = () => {
          if (menu === null) return
          menu.el.remove()
          menu = null
        }

        /**
         * Open the row menu at a point, clamped into the viewport.
         * The menu is the non-gesture half of the feature: the same insertion
         * the drag performs, reachable without a drag (and later bindable to a
         * keyboard trigger once the tree has a focused row).
         * @param insertion - resolved chip + text forms for the row.
         */
        const openMenu = (insertion, x, y) => {
          closeMenu()
          const el = document.createElement('div')
          el.className = 'dsh-drag-ref-menu'
          el.setAttribute('role', 'menu')
          el.setAttribute('aria-label', '文件引用')

          const pathLine = document.createElement('div')
          pathLine.className = 'dsh-drag-ref-menu-path'
          pathLine.textContent = insertion.mention

          const action = document.createElement('button')
          action.type = 'button'
          action.className = 'dsh-drag-ref-menu-item'
          action.setAttribute('role', 'menuitem')
          action.tabIndex = 0
          const glyph = document.createElement('span')
          glyph.className = 'dsh-drag-ref-menu-glyph'
          glyph.textContent = '＠'
          const label = document.createElement('span')
          label.textContent = '引用到对话'
          action.append(glyph, label)
          action.addEventListener('click', () => {
            closeMenu()
            drop(insertion)
          })

          el.append(pathLine, action)
          document.body.append(el)

          const box = typeof el.getBoundingClientRect === 'function'
            ? el.getBoundingClientRect()
            : { width: 0, height: 0 }
          const margin = 8
          const viewWidth = typeof window === 'undefined' ? 0 : window.innerWidth || 0
          const viewHeight = typeof window === 'undefined' ? 0 : window.innerHeight || 0
          el.style.left = (viewWidth > 0
            ? Math.min(x, Math.max(margin, viewWidth - box.width - margin))
            : x) + 'px'
          el.style.top = (viewHeight > 0
            ? Math.min(y, Math.max(margin, viewHeight - box.height - margin))
            : y) + 'px'
          menu = { el }
          if (typeof action.focus === 'function') action.focus()
        }

        const onContextMenu = (event) => {
          const row = rowUnder(event.target)
          if (row === null) {
            if (menu !== null) closeMenu()
            return
          }
          const insertion = insertionFor(
            row.dataset.filesPath,
            workspaceRootOf(row),
            row.dataset.filesEntry === 'directory',
          )
          if (insertion === null) return
          // The tree rows have no other menu, so this one replaces the native one.
          event.preventDefault()
          event.stopPropagation()
          openMenu(insertion, event.clientX, event.clientY)
        }

        const onPointerDown = (event) => {
          if (menu !== null && !menu.el.contains(event.target)) closeMenu()
          if (event.button !== 0 || event.isPrimary === false) return
          const row = rowUnder(event.target)
          if (row === null) return
          pending = { row, x: event.clientX, y: event.clientY }
        }

        const onPointerMove = (event) => {
          if (pending === null) return
          if (drag === null) {
            if (
              Math.abs(event.clientX - pending.x) < THRESHOLD &&
              Math.abs(event.clientY - pending.y) < THRESHOLD
            ) {
              return
            }
            drag = beginDrag(pending.row)
            document.body.classList.add('dsh-drag-ref-active')
          }
          event.preventDefault()
          moveGhost(drag, event.clientX, event.clientY)
          const target = composerUnder(event.clientX, event.clientY)
          drag.ghost.dataset.over =
            target !== null && belongsTo(target, sessionId) && drag.mention !== null ? 'true' : 'false'
        }

        const onPointerUp = (event) => {
          if (drag === null) {
            pending = null
            return
          }
          const target = composerUnder(event.clientX, event.clientY)
          const accepted = target !== null && belongsTo(target, sessionId) ? drop(drag) : false
          // A completed drag must not also open the row's file preview.
          swallowClick = true
          clearTimeout(swallowTimer)
          swallowTimer = setTimeout(() => {
            swallowClick = false
          }, 400)
          endDrag()
          if (accepted) event.preventDefault()
        }

        const onPointerCancel = () => {
          endDrag()
        }

        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          if (menu !== null) {
            event.preventDefault()
            closeMenu()
            return
          }
          if (drag !== null) {
            event.preventDefault()
            endDrag()
          }
        }

        const onClickCapture = (event) => {
          if (!swallowClick) return
          swallowClick = false
          event.stopPropagation()
          event.preventDefault()
        }

        const listening = { capture: true }
        document.addEventListener('pointerdown', onPointerDown, listening)
        document.addEventListener('pointermove', onPointerMove, listening)
        document.addEventListener('pointerup', onPointerUp, listening)
        document.addEventListener('pointercancel', onPointerCancel, listening)
        document.addEventListener('keydown', onKeyDown, listening)
        document.addEventListener('click', onClickCapture, listening)
        document.addEventListener('contextmenu', onContextMenu, listening)
        document.addEventListener('scroll', closeMenu, true)

        return () => {
          clearTimeout(swallowTimer)
          endDrag()
          closeMenu()
          document.removeEventListener('pointerdown', onPointerDown, listening)
          document.removeEventListener('pointermove', onPointerMove, listening)
          document.removeEventListener('pointerup', onPointerUp, listening)
          document.removeEventListener('pointercancel', onPointerCancel, listening)
          document.removeEventListener('keydown', onKeyDown, listening)
          document.removeEventListener('click', onClickCapture, listening)
          document.removeEventListener('contextmenu', onContextMenu, listening)
          document.removeEventListener('scroll', closeMenu, true)
        }
      }, [inputActions, sessionId, insertDragReference])

      return null
    }

    /** Client services this plugin requires before its effect can run. */
    const inject = ['slots', 'sessions']

    /**
     * Mount the invisible dock entry that owns the drag.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      console.info('[drag-reference] dock registered')
      ctx.slots.inject('conversation.input.dock', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.dock',
            id: 'drag-reference',
            order: 80,
            inject: (sessionId) => ({
              dragReferenceSessionId: sessionId,
              // Resolved per drop: the Session scope and its input shell exist
              // only while the Session is retained.
              insertDragReference: (reference) => insertChip(ctx.sessions, sessionId, reference),
            }),
          },
          DragReferenceDock,
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
