// Behaviour smoke test for the drag-reference client bundle, no browser:
// a fake DOM exercises the pointer pipeline the component installs, and a fake
// Session scope exercises the reference-chip path plus its text fallback.
//
// Usage:  node test/smoke.mjs [path/to/client.js]
// Defaults to this package's own lib/client.js.

import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const file = process.argv[2] ?? fileURLToPath(new URL('../lib/client.js', import.meta.url))

/* ── minimal DOM ─────────────────────────────────────────────────────────── */

const focused = []

function makeElement(tag, attrs = {}) {
  return {
    tagName: tag.toUpperCase(),
    className: '',
    dataset: {},
    style: {},
    textContent: '',
    children: [],
    removed: false,
    attrs,
    listeners: {},
    append(...nodes) {
      this.children.push(...nodes)
    },
    remove() {
      this.removed = true
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value)
    },
    addEventListener(type, handler) {
      if (this.listeners[type] === undefined) this.listeners[type] = []
      this.listeners[type].push(handler)
    },
    removeEventListener(type, handler) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((item) => item !== handler)
    },
    contains(node) {
      if (node === this) return true
      return this.children.some((child) => child === node)
    },
    getBoundingClientRect() {
      return { width: 240, height: 64, left: 0, top: 0, right: 240, bottom: 64 }
    },
    focus() {
      focused.push(this)
    },
    click() {
      for (const handler of this.listeners.click ?? []) {
        handler({ preventDefault() {}, stopPropagation() {} })
      }
    },
    closest(selector) {
      if (this.selectors?.has(selector)) return this
      return this.parents?.[selector] ?? null
    },
    querySelector() {
      return null
    },
  }
}

const listeners = new Map()
const head = makeElement('head')
head.appendChild = (node) => {
  head.children.push(node)
  return node
}
const body = makeElement('body')
body.classList = {
  values: new Set(),
  add(name) {
    this.values.add(name)
  },
  remove(name) {
    this.values.delete(name)
  },
}
const document = {
  head,
  body,
  createElement: (tag) => makeElement(tag),
  querySelector: () => null,
  elementFromPoint: () => null,
  addEventListener(type, handler) {
    const list = listeners.get(type) ?? []
    list.push(handler)
    listeners.set(type, list)
  },
  removeEventListener(type, handler) {
    listeners.set(
      type,
      (listeners.get(type) ?? []).filter((item) => item !== handler),
    )
  },
}

function emit(type, event) {
  for (const handler of listeners.get(type) ?? []) handler(event)
}

const pointerEvent = (x, y, target = null) => ({
  button: 0,
  isPrimary: true,
  clientX: x,
  clientY: y,
  target,
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true
  },
  stopPropagation() {},
})

const contextEvent = (x, y, target) => ({
  clientX: x,
  clientY: y,
  target,
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true
  },
  stopPropagation() {},
})

/* ── load the bundle ─────────────────────────────────────────────────────── */

const code = fs.readFileSync(file, 'utf8')
let registration = null
const sandbox = {
  window: { __ModuleLoader__: { load: (entry) => (registration = entry) } },
  document,
  console,
  setTimeout,
  clearTimeout,
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(code, sandbox, { filename: file })

if (registration === null) throw new Error('bundle registered no factory')
if (registration.id !== 'dsh-plugin-drag-reference') throw new Error('unexpected bundle id')

let effects = []
const mod = registration.factory((specifier) => {
  if (specifier === 'react') {
    return {
      useEffect: (fn) => {
        effects.push(fn)
      },
    }
  }
  throw new Error(`unexpected require: ${specifier}`)
})

/* ── fake Session scope, input shell, and slot registry ──────────────────── */

const chipCalls = []
let chipMode = 'accept'
let focusCount = 0

const shell = {
  addFiles(references, ids) {
    chipCalls.push({ references, ids })
    return chipMode === 'accept'
  },
  focus() {
    focusCount += 1
  },
}

const sessions = {
  scope(sessionId) {
    if (sessionId !== 'session-main') return undefined
    return {
      get(name) {
        if (name !== 'conversation') return undefined
        return { input: { for: () => shell } }
      },
    }
  },
}

let dock = null
const ctx = {
  sessions,
  slots: {
    inject: (seat, factory) => {
      if (seat !== 'conversation.input.dock') throw new Error(`unexpected seat: ${seat}`)
      factory()
      return () => {}
    },
    register: (options, Component) => {
      dock = { options, Component }
      return dock
    },
  },
}

if (!mod.inject.includes('sessions')) throw new Error('plugin must inject the sessions service')
mod.apply(ctx)
if (dock === null) throw new Error('apply registered no dock entry')

const textCalls = []
const inputActions = {
  captureInsertion: () => ({ start: 0, end: 0, draftRev: 3 }),
  insertText: (text, span) => {
    textCalls.push({ text, span })
    return true
  },
}

let cleanup = () => {}

function mount(overrides = {}) {
  cleanup()
  effects = []
  const props = { ...dock.options.inject('session-main'), inputActions, ...overrides }
  const rendered = dock.Component(props)
  if (rendered !== null) throw new Error('dock component must render null')
  if (effects.length !== 1) throw new Error(`expected one effect, got ${effects.length}`)
  cleanup = effects[0]()
  return props
}

mount()

/* ── fake tree row + composer ────────────────────────────────────────────── */

const ROOT = 'D:\\workspace'

function treeRow(entry, path) {
  const row = makeElement('li')
  row.dataset.filesEntry = entry
  row.dataset.filesPath = path
  row.selectors = new Set(['[data-files-entry][data-files-path]'])
  row.parents = {
    '[data-files-body]': makeElement('div'),
    '[data-files-root]': makeElement('div', { 'data-files-root': ROOT }),
  }
  return row
}

function composerTarget(sessionId) {
  const owner = makeElement('div', { 'data-conversation-session': sessionId })
  const region = makeElement('div')
  region.parents = { '[data-conversation-session]': owner }
  const element = makeElement('div')
  element.parents = { '[data-conversation-region="composer"]': region }
  return element
}

function drag(row, from = [10, 10], to = [20, 40]) {
  emit('pointerdown', pointerEvent(from[0], from[1], row))
  emit('pointermove', pointerEvent(to[0], to[1], null))
  emit('pointerup', pointerEvent(to[0], to[1], null))
}

function lastChip() {
  const call = chipCalls.at(-1)
  return call === undefined ? undefined : call.references[0]
}

/* ── case 1: a chip for a file whose name has spaces ─────────────────────── */

document.elementFromPoint = () => composerTarget('session-main')
document.querySelector = () => null

emit('pointerdown', pointerEvent(100, 100, treeRow('file', ROOT + '\\new doc.doc')))
emit('pointermove', pointerEvent(140, 130, null))
if (!body.classList.values.has('dsh-drag-ref-active')) throw new Error('drag class not applied')
const ghost = body.children.at(-1)
if (ghost.className !== 'dsh-drag-ref-ghost') throw new Error('no ghost created')
if (!ghost.children.map((child) => child.textContent).join('').includes('new doc.doc')) {
  throw new Error('ghost label missing')
}
emit('pointerup', pointerEvent(140, 130, null))

if (chipCalls.length !== 1) throw new Error(`expected one chip insert, got ${chipCalls.length}`)
if (textCalls.length !== 0) throw new Error('chip path must not also insert text')
const reference = lastChip()
if (reference.source !== 'reference') throw new Error(`source: ${reference.source}`)
if (reference.ref !== '@"new doc.doc"') throw new Error(`ref: ${reference.ref}`)
if (reference.clipboardText !== '@"new doc.doc"') throw new Error(`clipboard: ${reference.clipboardText}`)
if (reference.label !== 'new doc.doc') throw new Error(`label: ${reference.label}`)
if (reference.appearance !== 'file') throw new Error(`appearance: ${reference.appearance}`)
if (chipCalls[0].ids.length !== 0) throw new Error('chip insert must carry no attachment ids')
if (focusCount !== 1) throw new Error('composer focus was not handed back')
if (body.classList.values.has('dsh-drag-ref-active')) throw new Error('drag class left behind')
if (ghost.removed !== true) throw new Error('ghost not removed')

/* ── case 2: nested file keeps a relative mention ────────────────────────── */

drag(treeRow('file', ROOT + '\\src\\main.ts'))
if (lastChip()?.ref !== '@src/main.ts') throw new Error(`case 2: ${lastChip()?.ref}`)
if (lastChip()?.label !== 'main.ts') throw new Error(`case 2 label: ${lastChip()?.label}`)

/* ── case 3: a directory becomes a folder chip ───────────────────────────── */

drag(treeRow('directory', ROOT + '\\src'))
if (lastChip()?.ref !== '@src/') throw new Error(`case 3 ref: ${lastChip()?.ref}`)
if (lastChip()?.label !== 'src/') throw new Error(`case 3 label: ${lastChip()?.label}`)
if (lastChip()?.appearance !== 'folder') throw new Error(`case 3 appearance: ${lastChip()?.appearance}`)

/* ── case 4: outside the workspace the path stays absolute ───────────────── */

drag(treeRow('file', 'E:\\other\\x.md'))
if (lastChip()?.ref !== '@E:/other/x.md') throw new Error(`case 4: ${lastChip()?.ref}`)

/* ── case 5: a refused chip falls back to plain text with a separator ────── */

chipMode = 'refuse'
const editor = makeElement('div')
editor.textContent = 'look at this'
const composerSeat = makeElement('div')
composerSeat.querySelector = () => editor
document.querySelector = (selector) =>
  selector === '[data-conversation-region="composer"]' ? composerSeat : null

const chipsBefore = chipCalls.length
drag(treeRow('file', ROOT + '\\src\\main.ts'))
if (chipCalls.length !== chipsBefore + 1) throw new Error('fallback did not try the chip first')
if (textCalls.at(-1)?.text !== ' @src/main.ts ') {
  throw new Error(`case 5 fallback: ${JSON.stringify(textCalls.at(-1)?.text)}`)
}
chipMode = 'accept'

/* ── case 6: dropping outside the composer inserts nothing ───────────────── */

document.elementFromPoint = () => null
const chipsNow = chipCalls.length
drag(treeRow('file', ROOT + '\\README.md'))
if (chipCalls.length !== chipsNow) throw new Error('dropped outside the composer but inserted')

/* ── case 7: another Session's composer is refused ───────────────────────── */

document.elementFromPoint = () => composerTarget('session-other')
drag(treeRow('file', ROOT + '\\README.md'))
if (chipCalls.length !== chipsNow) throw new Error('inserted into another Session')

/* ── case 8: a click does not drag ───────────────────────────────────────── */

document.elementFromPoint = () => composerTarget('session-main')
emit('pointerdown', pointerEvent(10, 10, treeRow('file', ROOT + '\\README.md')))
emit('pointermove', pointerEvent(12, 11, null))
emit('pointerup', pointerEvent(12, 11, null))
if (chipCalls.length !== chipsNow) throw new Error('a 2px move started a drag')

/* ── case 9: Escape cancels, and a later drag still works ────────────────── */

emit('pointerdown', pointerEvent(10, 10, treeRow('file', ROOT + '\\a.txt')))
emit('pointermove', pointerEvent(60, 60, null))
emit('keydown', { key: 'Escape', preventDefault() {} })
emit('pointerup', pointerEvent(60, 60, null))
if (chipCalls.length !== chipsNow) throw new Error('Escape did not cancel')

drag(treeRow('file', ROOT + '\\a.txt'), [10, 10], [60, 60])
if (lastChip()?.ref !== '@a.txt') throw new Error(`drag after cancel: ${lastChip()?.ref}`)

/* ── case 10: the tab-header pseudo-row is ignored ───────────────────────── */

const before = chipCalls.length
const header = makeElement('div')
header.dataset.filesPath = 'true'
header.dataset.filesEntry = 'file'
header.selectors = new Set(['[data-files-entry][data-files-path]'])
header.parents = {
  '[data-files-body]': makeElement('div'),
  '[data-files-root]': makeElement('div', { 'data-files-root': ROOT }),
}
drag(header)
if (chipCalls.length !== before) throw new Error('header pseudo-row dragged')

/* ── case 11: no Session scope (unretained) still inserts plain text ─────── */

const orphan = dock.options.inject('session-gone')
if (typeof orphan.insertDragReference !== 'function') throw new Error('no injected chip inserter')
if (orphan.insertDragReference({ ref: '@x' }) !== false) throw new Error('detached chip insert must fail')

/* ── case 12: a refused insert leaves no ghost behind ────────────────────── */

mount()
chipMode = 'refuse'
const refusing = {
  captureInsertion: () => ({ start: 0, end: 0, draftRev: 1 }),
  insertText: () => false,
}
mount({ inputActions: refusing })
drag(treeRow('file', ROOT + '\\README.md'))
if (body.children.some((child) => child.className === 'dsh-drag-ref-ghost' && !child.removed)) {
  throw new Error('ghost leaked after a refused insert')
}

/* ── case 13: right-click opens the row menu and references the row ─────── */

mount()
chipMode = 'accept'
document.querySelector = () => null
const menuBefore = chipCalls.length
const menuEvent = contextEvent(500, 400, treeRow('file', ROOT + '\\src\\app.ts'))
emit('contextmenu', menuEvent)
if (menuEvent.defaultPrevented !== true) throw new Error('row menu did not replace the native menu')

const openMenuEl = body.children.filter((child) => child.className === 'dsh-drag-ref-menu' && !child.removed).at(-1)
if (openMenuEl === undefined) throw new Error('no row menu opened')
const pathLine = openMenuEl.children[0]
if (pathLine.textContent !== '@src/app.ts') throw new Error(`menu path: ${pathLine.textContent}`)
const item = openMenuEl.children[1]
const itemText = item.children.map((child) => child.textContent).join('')
if (itemText !== '＠引用到对话') throw new Error(`menu item: ${itemText}`)
if (item.attrs.role !== 'menuitem') throw new Error('menu item has no menuitem role')
if (focused.at(-1) !== item) throw new Error('menu item was not focused for keyboard use')

item.click()
if (chipCalls.length !== menuBefore + 1) throw new Error('menu action inserted nothing')
if (lastChip()?.ref !== '@src/app.ts') throw new Error(`menu chip ref: ${lastChip()?.ref}`)
if (!openMenuEl.removed) throw new Error('menu stayed open after the action')

/* ── case 14: the folder row menu offers the folder reference ────────────── */

const folderEvent = contextEvent(500, 400, treeRow('directory', ROOT + '\\src'))
emit('contextmenu', folderEvent)
if (folderEvent.defaultPrevented !== true) throw new Error('folder row did not open a menu')
const folderMenu = body.children.filter((child) => child.className === 'dsh-drag-ref-menu' && !child.removed).at(-1)
if (folderMenu.children[0].textContent !== '@src/') throw new Error('folder menu path')
folderMenu.children[1].click()
if (lastChip()?.ref !== '@src/' || lastChip()?.appearance !== 'folder') {
  throw new Error(`folder menu chip: ${JSON.stringify(lastChip())}`)
}

/* ── case 15: Escape and an outside press both close the menu ────────────── */

emit('contextmenu', contextEvent(500, 400, treeRow('file', ROOT + '\\a.txt')))
const escMenu = body.children.filter((child) => child.className === 'dsh-drag-ref-menu' && !child.removed).at(-1)
emit('keydown', { key: 'Escape', preventDefault() {} })
if (!escMenu.removed) throw new Error('Escape did not close the menu')

emit('contextmenu', contextEvent(500, 400, treeRow('file', ROOT + '\\b.txt')))
const pressMenu = body.children.filter((child) => child.className === 'dsh-drag-ref-menu' && !child.removed).at(-1)
emit('pointerdown', pointerEvent(10, 10, treeRow('file', ROOT + '\\c.txt')))
if (!pressMenu.removed) throw new Error('outside press did not close the menu')

/* ── case 16: non-rows keep the native menu ──────────────────────────────── */

const headerEvent = contextEvent(500, 400, header)
emit('contextmenu', headerEvent)
if (headerEvent.defaultPrevented !== false) throw new Error('header pseudo-row replaced the native menu')

const plain = makeElement('div')
plain.parents = { '[data-files-body]': makeElement('div') }
const plainEvent = contextEvent(500, 400, plain)
emit('contextmenu', plainEvent)
if (plainEvent.defaultPrevented !== false) throw new Error('non-row replaced the native menu')

/* ── case 17: a path the grammar cannot carry opens no menu ──────────────── */

const quotedRow = treeRow('file', ROOT + '\\say "hi".txt')
const quotedEvent = contextEvent(500, 400, quotedRow)
emit('contextmenu', quotedEvent)
if (quotedEvent.defaultPrevented !== false) throw new Error('unrepresentable path opened a menu')

/* ── case 18: remounting closes a lingering menu ─────────────────────────── */

emit('contextmenu', contextEvent(500, 400, treeRow('file', ROOT + '\\d.txt')))
const stale = body.children.filter((child) => child.className === 'dsh-drag-ref-menu' && !child.removed).at(-1)
mount()
if (!stale.removed) throw new Error('menu survived a remount')

cleanup()
console.log(`ok: 18 drag-reference cases (${chipCalls.length} chip inserts, ${textCalls.length} text inserts)`)
