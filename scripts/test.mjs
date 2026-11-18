// Offline checks run by CI after every Orca sync: generated files parse and the formatters behave.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const read = (f) => readFileSync(new URL(`../extension/${f}`, import.meta.url), 'utf8')
new vm.Script(read('vendor/orca-main.js')) // throws on a syntax error
assert.match(read('vendor/orca-main.js'), /__orcaGrab/)
assert.match(read('vendor/orca-main.js'), /yravg-orca-result/)

const win = {}
vm.runInNewContext(read('vendor/orca-format.js'), { window: win })
const payload = {
  page: { sanitizedUrl: 'http://example.test/a', capturedAt: 'now' },
  target: {
    tagName: 'div', selector: 'div.cl-one', textSnippet: 'Hello', htmlSnippet: '<div>Hello</div>', attributes: {},
    accessibility: { role: 'div', accessibleName: null }, rectViewport: { x: 0, y: 0, width: 1068, height: 40 },
    rectPage: { x: 0, y: 0, width: 1068, height: 40 }, computedStyles: { display: 'flex', fontSize: '13px' },
    fullPath: 'body > div', reactComponents: null, sourceFile: null
  },
  nearbyText: ['File'], ancestorPath: ['div', 'body'], screenshot: null
}
const text = win.__yravgOrcaFormat.formatGrabPayloadAsText(payload)
assert.match(text, /^Attached browser context from http:\/\/example\.test\/a/)
assert.match(text, /Selector: div\.cl-one/)
const md = win.__yravgOrcaFormat.formatBrowserAnnotationsAsMarkdown(
  [{ id: '1', browserPageId: '', comment: 'make it blue', intent: 'change', priority: 'important', createdAt: '', payload }],
  { includeDiagnostics: true }
)
assert.match(md, /make it blue/)
console.log('ok')
