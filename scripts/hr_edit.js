import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/HR.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('editEmployee')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add editEmployee and deleteEmployee functions after saveEmployee
mustReplace(
  '  // Performance averages',
  `  function openEditEmployee(emp) {
    const cl = Array.isArray(emp.checklist) ? emp.checklist : JSON.parse(emp.checklist || '[]')
    const padded = [...cl, ...Array(Math.max(0, 6 - cl.length)).fill('')]
    setEmpForm({ name: emp.name, role: emp.role, email: emp.email || '', pin: emp.pin || '', checklist: padded, id: emp.id })
    setModal('edit-employee')
  }

  async function updateEmployee() {
    if (!empForm.name || !empForm.role) return alert('Name and role required')
    const checklist = empForm.checklist.filter(c => c.trim())
    if (checklist.length < 1) return alert('Add at least one metric')
    setSaving(true)
    await supabase.from('hr_employees').update({
      name: empForm.name, role: empForm.role, email: empForm.email || null,
      pin: empForm.pin || null, checklist: JSON.stringify(checklist),
    }).eq('id', empForm.id)
    await load()
    setModal(null)
    setSaving(false)
  }

  async function deleteEmployee(emp) {
    if (!confirm(\`Remove \${emp.name}? Their review history will also be deleted.\`)) return
    await supabase.from('hr_reviews').delete().eq('employee_id', emp.id)
    await supabase.from('hr_employees').delete().eq('id', emp.id)
    if (activeEmp?.id === emp.id) setActiveEmp(null)
    await load()
  }

  // Performance averages`,
  '1. Add edit/delete functions'
)

// 2. Add edit/delete buttons to employee list item
mustReplace(
  "                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{emp.role}</div>",
  `                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{emp.role}</div>
                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEditEmployee(emp)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--muted)', padding: '2px 4px' }}>Edit</button>
                    <button onClick={() => deleteEmployee(emp)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#c0392b', padding: '2px 4px' }}>Del</button>
                  </div>
                </div>`,
  '2. Edit/delete buttons'
)

// 3. Handle edit-employee modal (reuse add-employee modal with conditional)
mustReplace(
  "      {modal === 'add-employee' && (",
  "      {(modal === 'add-employee' || modal === 'edit-employee') && (",
  '3a. Modal condition'
)

mustReplace(
  "            <div className=\"modal-header\"><div className=\"modal-title\">Add employee</div>",
  "            <div className=\"modal-header\"><div className=\"modal-title\">{modal === 'edit-employee' ? 'Edit employee' : 'Add employee'}</div>",
  '3b. Modal title'
)

mustReplace(
  "              <button className=\"btn btn-primary\" onClick={saveEmployee} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>",
  "              <button className=\"btn btn-primary\" onClick={modal === 'edit-employee' ? updateEmployee : saveEmployee} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>",
  '3c. Save button'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
