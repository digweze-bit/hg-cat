import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Reports.jsx')

let src = fs.readFileSync(file, 'utf8')

// 1. Fix duplicate "Print Print this report"
src = src.replace('Print Print this report', 'Print this report')

// 2. Add per-currency grouping useMemo after totalReceivable
const oldTotal = `  const totalReceivable = useMemo(() =>\r\n    receivableData.reduce((s, inv) => s + Number(inv.balance_due || 0), 0), [receivableData])`
const newTotal = `  const totalReceivable = useMemo(() =>\r\n    receivableData.reduce((s, inv) => s + Number(inv.balance_due || 0), 0), [receivableData])\r\n\r\n  const receivableByCurrency = useMemo(() => {\r\n    const groups = {}\r\n    receivableData.forEach(inv => {\r\n      const cur = inv.currency || 'NGN'\r\n      if (!groups[cur]) groups[cur] = { currency: cur, total: 0, count: 0, invoices: [] }\r\n      groups[cur].total += Number(inv.balance_due || 0)\r\n      groups[cur].count += 1\r\n      groups[cur].invoices.push(inv)\r\n    })\r\n    return Object.values(groups).sort((a,b) => b.total - a.total)\r\n  }, [receivableData])`

if (!src.includes(oldTotal)) { console.error('totalReceivable pattern not found'); process.exit(1) }
src = src.replace(oldTotal, newTotal)

// 3. Replace the summary cards section to show per-currency totals
const oldCards = `          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>\r\n            <div className="card" style={{ padding:'16px 18px' }}>\r\n              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', color:'var(--amber)' }}>{receivableData.length}</div>\r\n              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Open invoices</div>\r\n            </div>\r\n            <div className="card" style={{ padding:'16px 18px' }}>\r\n              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', color:'var(--amber)' }}>\r\n                {'\\u20A6'}{totalReceivable.toLocaleString('en-NG', { maximumFractionDigits:0 })}\r\n              </div>\r\n              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Total outstanding (NGN equiv.)</div>\r\n            </div>\r\n            <div className="card" style={{ padding:'16px 18px' }}>\r\n              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>{receivableData.filter(i=>i.status==='partial').length}</div>\r\n              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Partially paid</div>\r\n            </div>\r\n          </div>`

const newCards = `          <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>\r
            <div className="card" style={{ padding:'16px 18px', minWidth:140 }}>\r
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', color:'var(--amber)' }}>{receivableData.length}</div>\r
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Open invoices</div>\r
            </div>\r
            <div className="card" style={{ padding:'16px 18px' }}>\r
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>{receivableData.filter(i=>i.status==='partial').length}</div>\r
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Partially paid</div>\r
            </div>\r
            {receivableByCurrency.map(g => (\r
              <div key={g.currency} className="card" style={{ padding:'16px 18px', minWidth:160 }}>\r
                <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', color:'var(--amber)' }}>\r
                  {formatAmount(g.total, g.currency)}\r
                </div>\r
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>\r
                  {g.currency} outstanding ({g.count})\r
                </div>\r
              </div>\r
            ))}\r
          </div>`

if (!src.includes(oldCards)) { console.error('Cards pattern not found - trying loose search'); }
else { src = src.replace(oldCards, newCards); console.log('Cards replaced') }

// 4. Replace table to group rows by currency with subtotals, and fix table footer
const oldTable = `                <tbody>\r\n                  {receivableData.length === 0\r\n                    ? <tr><td colSpan={8} style={{ textAlign:'center', color:'var(--muted)', padding:32 }}>No outstanding balances</td></tr>\r\n                    : receivableData.map(inv => {\r\n                        const overdue = inv.due_date && inv.due_date < new Date().toISOString().split('T')[0]\r\n                        return (\r\n                          <tr key={inv.id}>\r\n                            <td style={{ fontFamily:'var(--font-serif)', fontWeight:500 }}>{inv.invoice_number}</td>\r\n                            <td>{inv.clients?.name || '\\u2014'}</td>\r\n                            <td>{formatAmount(inv.total, inv.currency)}</td>\r\n                            <td style={{ color:'var(--green)' }}>{formatAmount(inv.amount_paid || 0, inv.currency)}</td>\r\n                            <td style={{ fontWeight:600, color: overdue ? 'var(--red)' : 'var(--amber)' }}>\r\n                              {formatAmount(inv.balance_due, inv.currency)}\r\n                              {overdue && <span style={{ fontSize:10, marginLeft:5, color:'var(--red)' }}>OVERDUE</span>}\r\n                            </td>\r\n                            <td style={{ fontSize:12, color:'var(--muted)' }}>{inv.currency}</td>\r\n                            <td><span className="badge badge-amber">{inv.status}</span></td>\r\n                            <td style={{ fontSize:12, color: overdue ? 'var(--red)' : 'var(--muted)' }}>{inv.due_date || '\\u2014'}</td>\r\n                          </tr>\r\n                        )\r\n                      })\r\n                  }\r\n                </tbody>\r\n                {receivableData.length > 0 && (\r\n                  <tfoot>\r\n                    <tr>\r\n                      <td colSpan={4} style={{ textAlign:'right', fontWeight:600, padding:'10px 14px', borderTop:'2px solid var(--line)' }}>Total outstanding</td>\r\n                      <td style={{ fontWeight:600, color:'var(--amber)', padding:'10px 14px', borderTop:'2px solid var(--line)' }}>\r\n                        {'\\u20A6'}{totalReceivable.toLocaleString('en-NG', { maximumFractionDigits:0 })}\r\n                      </td>\r\n                      <td colSpan={3} style={{ borderTop:'2px solid var(--line)' }} />\r\n                    </tr>\r\n                  </tfoot>\r\n                )}`

const newTable = `                <tbody>\r
                  {receivableData.length === 0\r
                    ? <tr><td colSpan={8} style={{ textAlign:'center', color:'var(--muted)', padding:32 }}>No outstanding balances</td></tr>\r
                    : receivableByCurrency.map(group => (\r
                        <>\r
                          <tr key={'hdr-'+group.currency}><td colSpan={8} style={{ background:'var(--parchment)', fontWeight:600, fontSize:12, padding:'8px 14px' }}>{group.currency}</td></tr>\r
                          {group.invoices.map(inv => {\r
                            const overdue = inv.due_date && inv.due_date < new Date().toISOString().split('T')[0]\r
                            return (\r
                              <tr key={inv.id}>\r
                                <td style={{ fontFamily:'var(--font-serif)', fontWeight:500 }}>{inv.invoice_number}</td>\r
                                <td>{inv.clients?.name || '\\u2014'}</td>\r
                                <td>{formatAmount(inv.total, inv.currency)}</td>\r
                                <td style={{ color:'var(--green)' }}>{formatAmount(inv.amount_paid || 0, inv.currency)}</td>\r
                                <td style={{ fontWeight:600, color: overdue ? 'var(--red)' : 'var(--amber)' }}>\r
                                  {formatAmount(inv.balance_due, inv.currency)}\r
                                  {overdue && <span style={{ fontSize:10, marginLeft:5, color:'var(--red)' }}>OVERDUE</span>}\r
                                </td>\r
                                <td style={{ fontSize:12, color:'var(--muted)' }}>{inv.currency}</td>\r
                                <td><span className="badge badge-amber">{inv.status}</span></td>\r
                                <td style={{ fontSize:12, color: overdue ? 'var(--red)' : 'var(--muted)' }}>{inv.due_date || '\\u2014'}</td>\r
                              </tr>\r
                            )\r
                          })}\r
                          <tr key={'sub-'+group.currency} style={{ background:'var(--surface-1,#f8f7f5)' }}>\r
                            <td colSpan={4} style={{ textAlign:'right', fontWeight:600, padding:'8px 14px', fontSize:12 }}>Subtotal ({group.currency})</td>\r
                            <td style={{ fontWeight:600, color:'var(--amber)', padding:'8px 14px', fontSize:12 }}>{formatAmount(group.total, group.currency)}</td>\r
                            <td colSpan={3} />\r
                          </tr>\r
                        </>\r
                      ))\r
                  }\r
                </tbody>`

if (!src.includes(oldTable)) { console.error('Table pattern not found - trying loose search') }
else { src = src.replace(oldTable, newTable); console.log('Table replaced') }

fs.writeFileSync(file, src, 'utf8')
console.log('Done')
