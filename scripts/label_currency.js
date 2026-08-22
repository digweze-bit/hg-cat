import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Replace the consignment currency buttons with a labeled version
src = src.replace(
  `<div style={{ display:"flex", gap:6 }}>
                            <div style={{ display:"flex", gap:2, flexShrink:0 }}>
                              {[["NGN","\u20A6"],["USD","$"],["GBP","\u00A3"],["EUR","\u20AC"]].map(([code,sym]) => (
                                <button key={code} type="button" onClick={() => setForm(f=>({...f,consignment_currency:code}))}`,
  `<div style={{ display:"flex", gap:6, alignItems:"center" }}>
                            <div style={{ display:"flex", gap:2, flexShrink:0, border:"2px solid var(--amber)", borderRadius:4, padding:2 }}>
                              {[["NGN","\u20A6"],["USD","$"],["GBP","\u00A3"],["EUR","\u20AC"]].map(([code,sym]) => (
                                <button key={code} type="button" onClick={() => setForm(f=>({...f,consignment_currency:code}))}`)

console.log('OK: Styled consignment currency buttons')

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('DONE')
