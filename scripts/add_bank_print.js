import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('Payment Account</div>')) { console.log('Already patched'); process.exit(0) }

const oldFooter = `<div class="footer"><div>Hourglass Gallery</div><div>298A Akin Olugbade Street, Victoria Island, Lagos</div><div>info@hourglassgallery.com</div></div>`

if (!src.includes(oldFooter)) { console.error('Footer not found'); process.exit(1) }

const bankBlock = `\${(() => {
  const bank = bankAccounts.find(b => b.id === selectedBankId) || bankAccounts.find(b => b.is_default) || bankAccounts[0]
  if (!bank) return ''
  let h = '<div style="margin-top:24px;padding:14px 16px;background:#faf8f5;border:1px solid #e8e3db;border-radius:3px">'
  h += '<div style="font-size:8px;text-transform:uppercase;letter-spacing:.07em;color:#999;margin-bottom:6px">Payment Account</div>'
  h += '<div style="font-weight:600;font-size:12px">' + bank.account_name + '</div>'
  h += '<div style="font-size:11px;color:#666">' + bank.bank_name + '</div>'
  h += '<div style="font-size:11px">Account: ' + bank.account_number + '</div>'
  if (bank.sort_code) h += '<div style="font-size:11px">Sort code: ' + bank.sort_code + '</div>'
  if (bank.routing_number) h += '<div style="font-size:11px">Routing: ' + bank.routing_number + '</div>'
  if (bank.swift_bic) h += '<div style="font-size:11px">SWIFT/BIC: ' + bank.swift_bic + '</div>'
  h += '</div>'
  return h
})()}
` + oldFooter

src = src.replace(oldFooter, bankBlock)
console.log('OK: Bank details added to printed invoice')

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
