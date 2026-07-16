async function buildInvoiceHTML(inv, client, items, payments, logoB64) {
  const bal = Number(inv.balance_due||0)
  function e(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
  const itemsWithImages = await Promise.all(items.map(async it => {
    if (!it.image_url) return it
    try {
      const resp = await fetch(it.image_url)
      const blob = await resp.blob()
      const dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob) })
      return { ...it, _imgData: dataUrl }
    } catch(_) { return it }
  }))
  const logoHtml = logoB64
    ? `<img src='${logoB64}' alt='Hourglass Gallery' style='height:36px;object-fit:contain;object-position:left center;display:block;'>`
    : `<div style="font-family:Georgia,serif;font-size:20px;color:#1a1714;font-weight:300;letter-spacing:.02em;">HOURGLASS GALLERY</div>`
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${e(inv.invoice_number)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,Helvetica,sans-serif;color:#1a1714;padding:32px 40px;max-width:600px;margin:0 auto;font-size:13px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #1a1714;}
.inv-meta{font-size:13px;font-family:Georgia,serif;color:#1a1714;text-align:right;}
.inv-no-small{font-size:13px;color:#6b6760;}
table{width:100%;border-collapse:collapse;margin-top:8px;}
th{padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#6b6760;border-bottom:2px solid #1a1714;}
td{padding:10px;border-bottom:1px solid #ece8e1;vertical-align:top;}
.total-row td{font-weight:600;font-size:14px;border-top:2px solid #1a1714;border-bottom:none;padding-top:12px;}
.footer{margin-top:40px;padding-top:16px;border-top:1px solid #ddd9d1;font-size:11px;color:#6b6760;line-height:1.8;}
.art-img{width:48px;height:48px;object-fit:cover;border-radius:2px;display:block;}
@media print{@page{margin:10mm 12mm;size:A4 portrait;}body{padding:0;max-width:100%;}}
</style></head><body>
<div class="header">
  <div>${logoHtml}</div>
  <div class="inv-meta">
    <div class="inv-no-small">${e(inv.invoice_number)}</div>
    ${inv.status==='paid'?'<div style="margin-top:4px;font-size:11px;font-weight:600;color:#27ae60;text-transform:uppercase;">Paid</div>':''}
    ${inv.status==='partial'?'<div style="margin-top:4px;font-size:11px;font-weight:600;color:#b8862a;text-transform:uppercase;">Partial</div>':''}
  </div>
</div>
${client?`<div style="margin-bottom:24px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#6b6760;margin-bottom:5px">Invoice to</div><div style="font-weight:600;font-size:14px;">${e(client.name)}</div>${client.company?`<div style="font-size:12px;color:#6b6760">${e(client.company)}</div>`:''}${client.street||client.address?`<div style="font-size:12px">${e(client.street||client.address)}</div>`:''}${client.city?`<div style="font-size:12px">${e(client.city)}${client.state?', '+e(client.state):''}</div>`:''}${client.email?`<div style="font-size:12px;color:#6b6760">${e(client.email)}</div>`:''}${client.phone||client.phone_mobile?`<div style="font-size:12px;color:#6b6760">${e(client.phone||client.phone_mobile)}</div>`:''}</div>`:''}
<table><thead><tr><th style="width:60px"></th><th>Artwork</th><th>Artist</th><th style="text-align:right">Amount (${e(inv.currency)})</th></tr></thead><tbody>
${itemsWithImages.map(it=>`<tr><td>${it._imgData?`<img src="${it._imgData}" class="art-img" alt="">`:'<div style="width:48px;height:48px;background:#f0ece7;border-radius:2px;"></div>'}</td><td><strong>${e(it.title)}</strong>${it.medium?`<br><span style="font-size:11px;color:#6b6760">${e(it.medium)}</span>`:''}${it.dimensions?`<br><span style="font-size:11px;color:#6b6760">${e(it.dimensions)}</span>`:''}${it.year?`<br><span style="font-size:11px;color:#6b6760">${e(it.year)}</span>`:''}</td><td style="font-size:12px;color:#6b6760">${e(it.artist_name||'')}</td><td style="text-align:right">${formatAmount(it.line_total,inv.currency)}</td></tr>`).join('')}
${Number(inv.vat_amount)>0?`<tr><td colspan="3" style="text-align:right;color:#6b6760">VAT (${inv.vat_rate}%)</td><td style="text-align:right">${formatAmount(inv.vat_amount,inv.currency)}</td></tr>`:''}
<tr class="total-row"><td colspan="3" style="text-align:right">Total</td><td style="text-align:right">${formatAmount(inv.total,inv.currency)}</td></tr>
${payments.length>0?`<tr><td colspan="3" style="text-align:right;color:#2d6a4f">Amount paid</td><td style="text-align:right;color:#2d6a4f">${formatAmount(inv.amount_paid,inv.currency)}</td></tr>`:''}
${bal>0?`<tr><td colspan="3" style="text-align:right;font-weight:600">Balance due</td><td style="text-align:right;font-weight:600;color:#92600a">${formatAmount(bal,inv.currency)}</td></tr>`:''}
</tbody></table>
${inv.notes?`<div style="margin-top:20px;font-size:12px;color:#6b6760;padding:10px 12px;background:#f8f7f5;border-radius:3px;">${e(inv.notes)}</div>`:''}
${payments.length>0?`<div style="margin-top:24px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#6b6760;margin-bottom:8px">Payment history</div>${payments.map(p=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #ece8e1;font-size:12px"><span style="color:#6b6760">${e(p.method)}${p.reference?' ref: '+e(p.reference):''}</span><span>${formatAmount(p.amount,p.currency)}</span></div>`).join('')}</div>`:''}
<div class="footer">
  <div>Hourglass Gallery</div>
  <div>298A Akin Olugbade Street, Victoria Island, Lagos</div>
  <div>info@hourglassgallery.com</div>
  <div>+234 (0)1 461 0090</div>
</div>
</body></html>`
}