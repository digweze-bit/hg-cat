import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function mustReplace(src, oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  console.log('OK: ' + label)
  return src.replace(oldStr, newStr)
}

// ── 1. Add Settings route to App.jsx ──
const appFile = path.join(__dirname, '../src/App.jsx')
let app = fs.readFileSync(appFile, 'utf8').replace(/\r\n/g, '\n')

if (!app.includes('Settings')) {
  // Add lazy import
  app = mustReplace(app,
    "const AuditLog = lazy(() => import('./pages/AuditLog'))",
    "const AuditLog = lazy(() => import('./pages/AuditLog'))\nconst Settings = lazy(() => import('./pages/Settings'))",
    'App: Settings import')

  // Add route
  app = mustReplace(app,
    "              <Route path=\"audit-log\" element={<AuditLog />} />",
    "              <Route path=\"audit-log\" element={<AuditLog />} />\n              <Route path=\"settings\" element={<Settings />} />",
    'App: Settings route')

  fs.writeFileSync(appFile, app, 'utf8')
  console.log('App.jsx updated')
}

// ── 2. Add Settings to sidebar ──
const layoutFile = path.join(__dirname, '../src/pages/AdminLayout.jsx')
let layout = fs.readFileSync(layoutFile, 'utf8').replace(/\r\n/g, '\n')

if (!layout.includes("'/admin/settings'")) {
  layout = mustReplace(layout,
    "  { path: '/admin/users', label: 'Staff users',",
    "  { path: '/admin/settings', label: 'Settings', icon: '\\u2699' },\n  { path: '/admin/users', label: 'Staff users',",
    'Layout: Settings nav')

  fs.writeFileSync(layoutFile, layout, 'utf8')
  console.log('AdminLayout.jsx updated')
}

// ── 3. Add bank account to InvoiceDetail in Sales.jsx ──
const salesFile = path.join(__dirname, '../src/pages/Sales.jsx')
let sales = fs.readFileSync(salesFile, 'utf8').replace(/\r\n/g, '\n')
const salesCRLF = sales.includes('\r\n')

if (!sales.includes('bankAccounts')) {
  // Add bankAccounts state
  sales = mustReplace(sales,
    '  const [pendingInvoiceId, setPendingInvoiceId] = useState(null)',
    '  const [pendingInvoiceId, setPendingInvoiceId] = useState(null)\n  const [bankAccounts, setBankAccounts] = useState([])',
    'Sales: bankAccounts state')

  // Load bank accounts in the load function
  sales = mustReplace(sales,
    '    setLoading(false)\n  }',
    '    supabase.from(\'bank_accounts\').select(\'*\').order(\'is_default\',{ascending:false}).order(\'account_name\').then(({data})=>setBankAccounts(data||[]))\n    setLoading(false)\n  }',
    'Sales: load bank accounts')

  // Pass bankAccounts to InvoiceDetail
  sales = mustReplace(sales,
    '<InvoiceDetail invoice={activeInvoice}',
    '<InvoiceDetail invoice={activeInvoice} bankAccounts={bankAccounts}',
    'Sales: pass bankAccounts to InvoiceDetail')

  // Update InvoiceDetail signature
  sales = mustReplace(sales,
    'function InvoiceDetail({ invoice: inv, clients, rates, userId, onClose, onSave, onEdit }) {',
    'function InvoiceDetail({ invoice: inv, clients, rates, userId, onClose, onSave, onEdit, bankAccounts = [] }) {',
    'InvoiceDetail: accept bankAccounts')

  fs.writeFileSync(salesFile, salesCRLF ? sales.replace(/\n/g, '\r\n') : sales, 'utf8')
  console.log('Sales.jsx updated')
}

console.log('ALL DONE')
