import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let src = fs.readFileSync(file, 'utf8')

if (src.includes('EDIT existing invoice')) {
  console.log('Already patched - skipping')
  process.exit(0)
}

const anchor = "setSaving(true)\r\n    try {\r\n      // Get next invoice number\r\n      const { data: numData } = await supabase.rpc('next_invoice_number')"

const idx = src.indexOf(anchor)
if (idx < 0) {
  console.error('Still not found')
  process.exit(1)
}

const editBranch = `setSaving(true)\r
    try {\r
      if (isEdit) {\r
        const { error: updErr } = await supabase.from('invoices').update({\r
          client_id: form.client_id, currency: form.currency,\r
          exchange_rate: form.keep_currency ? null : (form.fixed_rate || exchangeRate),\r
          keep_currency: form.keep_currency || false,\r
          discount_type: form.discount_type, discount_value: Number(form.discount_value)||0,\r
          vat_rate: Number(form.vat_rate)||0, vat_amount: vatAmt, subtotal, total,\r
          total_ngn: form.keep_currency ? null : totalNGN,\r
          balance_due: Math.max(0, total - Number(editInvoice.amount_paid||0)),\r
          issue_date: form.issue_date, due_date: form.due_date || null,\r
          notes: form.notes, terms: form.terms,\r
        }).eq('id', editInvoice.id)\r
        if (updErr) throw updErr\r
        await supabase.from('invoice_items').delete().eq('invoice_id', editInvoice.id)\r
        await supabase.from('invoice_items').insert(items.map((it,i) => ({\r
          invoice_id: editInvoice.id, artwork_id: it.artwork_id||null, book_id: it.book_id||null,\r
          item_type: it.item_type||'artwork', title: it.title, artist_name: it.artist_name,\r
          year: it.year, medium: it.medium, dimensions: it.dimensions,\r
          unit_price: Number(it.unit_price)||0, quantity: Number(it.quantity)||1,\r
          discount: Number(it.discount)||0,\r
          line_total: (Number(it.unit_price)||0)*(Number(it.quantity)||1)-(Number(it.discount)||0),\r
          sort_order: i, ownership: it.ownership||'gallery',\r
          commission_rate: it.ownership==='consignment'?(it.commission_rate||40):null,\r
          consignor_name: it.consignor_name||null,\r
        })))\r
        onSave(); onClose(); return\r
      }\r
      // EDIT existing invoice -- CREATE new invoice below\r
      // Get next invoice number\r
      const { data: numData } = await supabase.rpc('next_invoice_number')`

src = src.slice(0, idx) + editBranch + src.slice(idx + anchor.length)
fs.writeFileSync(file, src, 'utf8')
console.log('Patched successfully')

// Verify
const check = fs.readFileSync(file, 'utf8')
console.log('Contains isEdit branch:', check.includes('EDIT existing invoice'))
