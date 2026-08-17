import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function mustReplace(src, oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); process.exit(1) }
  console.log('OK: ' + label)
  return src.replace(oldStr, newStr)
}

// App.jsx — add route
const appFile = path.join(__dirname, '../src/App.jsx')
let app = fs.readFileSync(appFile, 'utf8').replace(/\r\n/g, '\n')
if (!app.includes('HR')) {
  app = mustReplace(app,
    "const Settings = lazy(() => import('./pages/Settings'))",
    "const Settings = lazy(() => import('./pages/Settings'))\nconst HR = lazy(() => import('./pages/HR'))",
    'App: HR import')
  app = mustReplace(app,
    '              <Route path="settings" element={<Settings />} />',
    '              <Route path="settings" element={<Settings />} />\n              <Route path="hr" element={<HR />} />',
    'App: HR route')
  fs.writeFileSync(appFile, app, 'utf8')
}

// AdminLayout.jsx — add nav item
const layoutFile = path.join(__dirname, '../src/pages/AdminLayout.jsx')
let layout = fs.readFileSync(layoutFile, 'utf8').replace(/\r\n/g, '\n')
if (!layout.includes("'/admin/hr'")) {
  layout = mustReplace(layout,
    "  { path: '/admin/settings', label: 'Settings', icon: '\\u2699' },",
    "  { path: '/admin/hr', label: 'Job Check', icon: '\\uD83D\\uDCCB' },\n  { path: '/admin/settings', label: 'Settings', icon: '\\u2699' },",
    'Layout: HR nav')
  fs.writeFileSync(layoutFile, layout, 'utf8')
}

console.log('ALL DONE')
