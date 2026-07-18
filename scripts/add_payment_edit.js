import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let src = fs.readFileSync(file, 'utf8')

if (src.includes('editingPayment')) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Add editPayment/deletePayment functions after addPayment
const anchor = "    } catch (err) {\r\n      alert('Payment failed: ' + err.message)\r\n    } finally { setSaving(false) }\r\n  }\r\n"
const idx = src.indexOf(anchor)
if (idx < 0) { console.error('addPayment anchor not found'); process.exit(1) }

const newFns = `    } catch (err) {\r
      alert('Payment failed: ' + err.message)\r
    } finally { setSaving(false) }\r
  }\r
\r
  async function updatePayment(paymentId, updates) {\r
    setSaving(true)\r
    try {\r
      const payRate = rates[updates.currency] || 1\r
      await supabase.from('payments').update({\r
        amount: parseFloat(updates.amount),\r
        currency: updates.currency,\r
        exchange_rate: payRate,\r
        amount_ngn: parseFloat(updates.amount) * payRate,\r
        method: updates.method,\r
        paid_at: updates.paid_at,\r
        reference: updates.reference,\r
        notes: updates.notes,\r
      }).eq('id', paymentId)\r
      onSave()\r
    } catch (err) {\r
      alert('Failed to update payment: ' + err.message)\r
    } finally { setSaving(false) }\r
  }\r
\r
  async function deletePayment(paymentId) {\r
    if (!confirm('Delete this payment record? The invoice balance will be recalculated.')) return\r
    setSaving(true)\r
    try {\r
      await supabase.from('payments').delete().eq('id', paymentId)\r
      onSave()\r
    } catch (err) {\r
      alert('Failed to delete payment: ' + err.message)\r
    } finally { setSaving(false) }\r
  }\r
`

src = src.slice(0, idx) + newFns + src.slice(idx + anchor.length)

// 2. Add editingPayment state near payForm state
const stateAnchor = src.match(/const \[payForm, setPayForm\][^\r\n]*\r\n/)
if (!stateAnchor) { console.error('payForm state not found'); process.exit(1) }
src = src.replace(stateAnchor[0], stateAnchor[0] + "  const [editingPayment, setEditingPayment] = useState(null)\r\n")

// 3. Replace the payment history rendering to add edit/delete buttons and inline edit form
const oldPaymentRow = `                : payments.map(p => (\r
                  <div key={p.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--line-soft)', fontSize:13 }}>\r
                    <div>\r
                      <span style={{ fontWeight:500 }}>{formatAmount(p.amount, p.currency)}</span>\r
                      <span style={{ color:'var(--muted)', marginLeft:8 }}>{p.method} {'\\u00B7'} {p.paid_at}</span>\r
                      {p.reference && <span style={{ color:'var(--muted)', marginLeft:8, fontSize:11 }}>ref: {p.reference}</span>}\r
                    </div>\r
                    <div style={{ color:'var(--muted)', fontSize:11 }}>\r
                      {p.currency !== 'NGN' && \`\\u2248 \\u20A6\${Number(p.amount_ngn).toLocaleString('en-NG',{maximumFractionDigits:0})}\`}\r
                    </div>\r
                  </div>\r
                ))`

const newPaymentRow = `                : payments.map(p => (\r
                  editingPayment === p.id ? (\r
                    <div key={p.id} style={{ padding:'10px 0', borderBottom:'1px solid var(--line-soft)', background:'var(--surface-1,#f8f7f5)' }}>\r
                      <PaymentEditRow payment={p} rates={rates}\r
                        onCancel={() => setEditingPayment(null)}\r
                        onSave={(vals) => { updatePayment(p.id, vals); setEditingPayment(null) }} />\r
                    </div>\r
                  ) : (\r
                    <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--line-soft)', fontSize:13 }}>\r
                      <div>\r
                        <span style={{ fontWeight:500 }}>{formatAmount(p.amount, p.currency)}</span>\r
                        <span style={{ color:'var(--muted)', marginLeft:8 }}>{p.method} {'\\u00B7'} {p.paid_at}</span>\r
                        {p.reference && <span style={{ color:'var(--muted)', marginLeft:8, fontSize:11 }}>ref: {p.reference}</span>}\r
                      </div>\r
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>\r
                        <div style={{ color:'var(--muted)', fontSize:11 }}>\r
                          {p.currency !== 'NGN' && \`\\u2248 \\u20A6\${Number(p.amount_ngn).toLocaleString('en-NG',{maximumFractionDigits:0})}\`}\r
                        </div>\r
                        <button onClick={() => setEditingPayment(p.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:12 }}>Edit</button>\r
                        <button onClick={() => deletePayment(p.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red,#c0392b)', fontSize:12 }}>Delete</button>\r
                      </div>\r
                    </div>\r
                  )\r
                ))`

if (!src.includes(oldPaymentRow)) {
  console.error('Payment row pattern not found - trying loose match')
  // try without exact whitespace
  const loosePattern = /: payments\.map\(p => \(\s*<div key=\{p\.id\}[\s\S]*?\}\)\s*\)\)/
  const m = src.match(loosePattern)
  if (m) {
    console.log('Found loose match, length:', m[0].length)
  } else {
    console.error('No match found at all')
  }
  process.exit(1)
}

src = src.replace(oldPaymentRow, newPaymentRow)

// 4. Add PaymentEditRow component before the buildInvoiceHTML function
const componentAnchor = 'async function buildInvoiceHTML('
const editRowComponent = `function PaymentEditRow({ payment, rates, onSave, onCancel }) {\r
  const [vals, setVals] = useState({\r
    amount: payment.amount,\r
    currency: payment.currency,\r
    method: payment.method,\r
    paid_at: payment.paid_at,\r
    reference: payment.reference || '',\r
    notes: payment.notes || '',\r
  })\r
  return (\r
    <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'4px 8px' }}>\r
      <div style={{ display:'flex', gap:8 }}>\r
        <input className="form-input" type="number" style={{ width:120 }} value={vals.amount} onChange={e=>setVals(v=>({...v,amount:e.target.value}))} placeholder="Amount" />\r
        <select className="form-select" style={{ width:90 }} value={vals.currency} onChange={e=>setVals(v=>({...v,currency:e.target.value}))}>\r
          {['NGN','USD','GBP','EUR'].map(c => <option key={c} value={c}>{c}</option>)}\r
        </select>\r
        <input className="form-input" style={{ width:120 }} value={vals.method} onChange={e=>setVals(v=>({...v,method:e.target.value}))} placeholder="Method" />\r
        <input className="form-input" type="date" style={{ width:140 }} value={vals.paid_at} onChange={e=>setVals(v=>({...v,paid_at:e.target.value}))} />\r
      </div>\r
      <div style={{ display:'flex', gap:8 }}>\r
        <input className="form-input" style={{ flex:1 }} value={vals.reference} onChange={e=>setVals(v=>({...v,reference:e.target.value}))} placeholder="Reference" />\r
        <button className="btn btn-primary btn-sm" onClick={() => onSave(vals)}>Save</button>\r
        <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>\r
      </div>\r
    </div>\r
  )\r
}\r
\r
`

const cIdx = src.indexOf(componentAnchor)
if (cIdx < 0) { console.error('buildInvoiceHTML anchor not found'); process.exit(1) }
src = src.slice(0, cIdx) + editRowComponent + src.slice(cIdx)

fs.writeFileSync(file, src, 'utf8')
console.log('Patched successfully: edit/delete payment functionality added')
