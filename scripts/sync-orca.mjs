#!/usr/bin/env node
// Sync the Annotate / Grab engine from stablyai/orca (MIT) and rebuild extension/vendor/*.
//   node scripts/sync-orca.mjs              fetch upstream main, rewrite upstream/ + vendor/
//   node scripts/sync-orca.mjs --ref <sha>  pin another ref
//   node scripts/sync-orca.mjs --check      exit 1 if upstream moved since the last sync (no writes)
//   node scripts/sync-orca.mjs --offline    rebuild vendor/ from the committed upstream/ copy
// shortcut: extracts functions by name/marker, not an AST; the build throws if a marker moves,
// so a breaking upstream refactor fails the sync job instead of shipping a broken capture.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = 'stablyai/orca'
const UP = join(ROOT, 'upstream', 'orca')
const META = join(ROOT, 'upstream', 'ORCA_SYNC.json')
const VENDOR = join(ROOT, 'extension', 'vendor')

const G = 'src/main/browser/element-grab/'
const FILES = [
  G + 'grab-guest-script.ts',
  G + 'grab-guest-foundation-script.ts',
  G + 'grab-guest-content-script.ts',
  G + 'grab-guest-element-context-script.ts',
  G + 'grab-guest-react-script.ts',
  G + 'grab-guest-overlay-script.ts',
  G + 'grab-guest-selection-scripts.ts',
  'src/shared/browser/element-grab/browser-composed-tree-script.ts',
  'src/shared/browser/annotations/browser-annotation-viewport-bridge.ts',
  'src/shared/browser/annotations/browser-annotation-output.ts',
  'src/shared/file-access/cross-platform-path.ts',
  'src/renderer/src/components/browser-pane/annotate/grab/GrabConfirmationSheet.tsx'
]

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const refIdx = args.indexOf('--ref')
const ref = refIdx >= 0 ? args[refIdx + 1] : 'main'
const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const headers = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}

async function get(url) {
  const r = await fetch(url, { headers })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r
}

async function fetchUpstream() {
  const { sha } = await (await get(`https://api.github.com/repos/${REPO}/commits/${ref}`)).json()
  const prev = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : null
  if (flag('--check')) {
    console.log(prev?.sha === sha ? `up to date @ ${sha.slice(0, 8)}` : `upstream moved: ${prev?.sha?.slice(0, 8)} -> ${sha.slice(0, 8)}`)
    process.exit(prev?.sha === sha ? 0 : 1)
  }
  const files = {}
  for (const f of FILES) {
    const text = await (await get(`https://raw.githubusercontent.com/${REPO}/${sha}/${f}`)).text()
    mkdirSync(dirname(join(UP, f)), { recursive: true })
    writeFileSync(join(UP, f), text)
    files[f] = sha256(text)
  }
  // syncedAt only changes when upstream changed, so an idle week produces no diff.
  const syncedAt = prev?.sha === sha ? prev.syncedAt : new Date().toISOString()
  writeFileSync(META, JSON.stringify({ repo: REPO, ref, sha, syncedAt, files }, null, 2) + '\n')
  return sha
}

const up = (f) => readFileSync(join(UP, f), 'utf8')
const stripImports = (s) => s.replace(/^import[\s\S]*?from\s+'[^']+'\r?\n/gm, '')

// Pull `export function name(...) {...}` out of a file; ends at the first column-0 closing brace.
function extractFn(src, name) {
  const start = src.search(new RegExp(`^export function ${name}\\(`, 'm'))
  if (start < 0) throw new Error(`upstream moved: function ${name} not found`)
  const end = src.indexOf('\n}\n', start)
  if (end < 0) throw new Error(`upstream moved: end of ${name} not found`)
  return src.slice(start, end + 2).replace(/^export /, '')
}

// Evaluate the `export const NAME = \`...\`` template strings of one upstream file.
function evalExports(file, consts) {
  let code = stripTypeScriptTypes(stripImports(up(file)))
  code = code.replace(/^export const /gm, 'const ')
  const names = [...code.matchAll(/^const (\w+) =/gm)].map((m) => m[1])
  return new Function(
    'BROWSER_GRAB_SELECTED_ATTRIBUTE',
    `${code}\nreturn {${names.join(',')}}`
  )(consts.BROWSER_GRAB_SELECTED_ATTRIBUTE)
}

function build() {
  mkdirSync(VENDOR, { recursive: true })
  const bridge = up('src/shared/browser/annotations/browser-annotation-viewport-bridge.ts')
  const attr = bridge.match(/export const BROWSER_GRAB_SELECTED_ATTRIBUTE = '([^']+)'/)?.[1]
  if (!attr) throw new Error('upstream moved: BROWSER_GRAB_SELECTED_ATTRIBUTE not found')
  const consts = { BROWSER_GRAB_SELECTED_ATTRIBUTE: attr }

  const all = {}
  for (const f of FILES.filter((x) => /(guest-(foundation|content|element-context|react|overlay|selection)|composed-tree)/.test(x))) {
    Object.assign(all, evalExports(f, consts))
  }

  // ARM order comes from upstream's own grab-guest-script.ts.
  const armBlock = up(G + 'grab-guest-script.ts').match(/const ARM_SCRIPT = \[([\s\S]*?)\]\.join/)?.[1]
  if (!armBlock) throw new Error('upstream moved: ARM_SCRIPT list not found')
  const armNames = armBlock.split(',').map((s) => s.trim()).filter(Boolean)
  for (const n of [...armNames, 'AWAIT_CLICK_SCRIPT', 'TEARDOWN_SCRIPT']) {
    if (typeof all[n] !== 'string') throw new Error(`upstream moved: script ${n} not found`)
  }
  const arm = armNames.map((n) => all[n]).join('')

  // MAIN-world file: arm the overlay, await the pick, hand the result to the isolated content
  // script through document CustomEvents (strings only, so it crosses the world boundary).
  const main = `// GENERATED by scripts/sync-orca.mjs from stablyai/orca - do not edit.
(function () {
  var send = function (d) { document.dispatchEvent(new CustomEvent('yravg-orca-result', { detail: JSON.stringify(d) })); };
  try {
${arm};
    var pick = ${all.AWAIT_CLICK_SCRIPT};
    document.addEventListener('yravg-orca-cancel', function () { try { ${all.TEARDOWN_SCRIPT}; } catch (e) {} }, { once: true });
    pick.then(function (r) { send(r); }, function (e) { send({ __error: String(e && e.message || e) }); });
  } catch (e) { send({ __error: String(e && e.message || e) }); }
})();
`
  writeFileSync(join(VENDOR, 'orca-main.js'), main)

  const sheet = up('src/renderer/src/components/browser-pane/annotate/grab/GrabConfirmationSheet.tsx')
  const grabText = stripTypeScriptTypes(extractFn(sheet, 'formatGrabPayloadAsText'))
  const paths = stripTypeScriptTypes(extractFn(up('src/shared/file-access/cross-platform-path.ts'), 'isWindowsAbsolutePathLike'))
  const out = stripTypeScriptTypes(stripImports(up('src/shared/browser/annotations/browser-annotation-output.ts')))
    .replace(/^export /gm, '')
  if (!/function formatBrowserAnnotationsAsMarkdown\(/.test(out)) throw new Error('upstream moved: formatBrowserAnnotationsAsMarkdown not found')

  writeFileSync(join(VENDOR, 'orca-format.js'), `// GENERATED by scripts/sync-orca.mjs from stablyai/orca - do not edit.
(function () {
${grabText}
${paths}
${out}
window.__yravgOrcaFormat = { formatGrabPayloadAsText: formatGrabPayloadAsText, formatBrowserAnnotationsAsMarkdown: formatBrowserAnnotationsAsMarkdown };
})();
`)
}

const sha = flag('--offline') ? JSON.parse(readFileSync(META, 'utf8')).sha : await fetchUpstream()
build()
console.log(`synced ${REPO} @ ${sha.slice(0, 8)} -> extension/vendor/`)
