import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const layoutFile = path.join(__dirname, '../src/pages/AdminLayout.jsx')
const cssFile = path.join(__dirname, '../src/index.css')

// 1. Patch AdminLayout.jsx
let raw = fs.readFileSync(layoutFile, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('sidebarOpen')) {
  console.log('Already patched')
  process.exit(0)
}

// Add useState import
src = src.replace(
  "import { NavLink, Outlet, useNavigate } from 'react-router-dom'",
  "import { useState } from 'react'\nimport { NavLink, Outlet, useNavigate } from 'react-router-dom'"
)

// Add sidebarOpen state in component
const compAnchor = "  const navigate = useNavigate()"
if (!src.includes(compAnchor)) { console.error('navigate anchor not found'); process.exit(1) }
src = src.replace(compAnchor, compAnchor + "\n  const [sidebarOpen, setSidebarOpen] = useState(false)")

// Add .open class to sidebar based on state
src = src.replace(
  `      <aside className="sidebar">`,
  `      <div className={\`sidebar-overlay \${sidebarOpen ? 'open' : ''}\`} onClick={() => setSidebarOpen(false)} />\n      <aside className={\`sidebar \${sidebarOpen ? 'open' : ''}\`}>`
)

// Close sidebar on nav link click (mobile)
src = src.replace(
  `            className={({ isActive }) => \`sidebar-nav-item\${isActive ? ' active' : ''}\`}`,
  `            onClick={() => setSidebarOpen(false)}\n            className={({ isActive }) => \`sidebar-nav-item\${isActive ? ' active' : ''}\`}`
)

// Add hamburger button to topbar
src = src.replace(
  `      <div className="topbar-left">`,
  `      <div className="topbar-left">\n        <button className="hamburger" onClick={() => setSidebarOpen(s => !s)} aria-label="Menu">\n          <span /><span /><span />\n        </button>`
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(layoutFile, final, 'utf8')
console.log('AdminLayout.jsx patched')

// 2. Append mobile CSS to index.css
const mobileCss = fs.readFileSync(path.join(__dirname, '../src/index.css'), 'utf8')
if (!mobileCss.includes('.hamburger')) {
  const newCss = `
/* ── MOBILE NAV ─────────────────────────────────────── */
.hamburger {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  color: var(--ink);
  flex-direction: column;
  gap: 5px;
  align-items: center;
  justify-content: center;
}
.hamburger span {
  display: block;
  width: 22px;
  height: 2px;
  background: currentColor;
  border-radius: 2px;
}
.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  z-index: 39;
}
.sidebar-overlay.open { display: block; }

@media (max-width: 600px) {
  .hamburger { display: flex; }
  .sidebar {
    position: fixed !important;
    top: 0; left: 0; bottom: 0;
    z-index: 40;
    transform: translateX(-100%);
    transition: transform 220ms ease;
    box-shadow: 4px 0 24px rgba(0,0,0,.18);
  }
  .sidebar.open { transform: translateX(0); }
  .main-content { margin-left: 0 !important; padding: 16px !important; }
  .topbar { padding: 0 16px !important; }
}
`
  fs.writeFileSync(path.join(__dirname, '../src/index.css'), mobileCss + newCss, 'utf8')
  console.log('index.css updated with mobile nav styles')
} else {
  console.log('Mobile CSS already present')
}
