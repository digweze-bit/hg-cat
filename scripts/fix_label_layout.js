import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

const oldStyle = `  .label{
    width:4in;height:2in;
    border:1.5px solid #000;
    display:flex;align-items:center;
    padding:10px 12px;gap:12px;
    page-break-inside:avoid;
  }
  .qr{flex-shrink:0;width:1.3in;height:1.3in}
  .qr img{width:100%;height:100%;display:block}
  .details{flex:1;overflow:hidden}
  .title{font-weight:700;font-size:11px;line-height:1.3;margin-bottom:4px}
  .line{font-size:10px;line-height:1.5;color:#222}
  @media print{
    body{display:block;min-height:unset}
    @page{size:4in 2in;margin:0}
    .label{border:1.5px solid #000 !important}
  }`

if (!src.includes(oldStyle)) { console.error('Style anchor not found'); process.exit(1) }

const newStyle = `  .label{
    width:480px;height:240px;
    border:1.5px solid #000;
    display:flex;align-items:center;
    padding:12px 14px;gap:14px;
  }
  .qr{flex-shrink:0;width:156px;height:156px}
  .qr img{width:156px;height:156px;display:block}
  .details{flex:1;min-width:0}
  .title{font-weight:700;font-size:12px;line-height:1.4;margin-bottom:5px;word-wrap:break-word}
  .line{font-size:11px;line-height:1.6;color:#222}
  @media print{
    body{display:block;min-height:unset;margin:0;padding:0}
    @page{size:4in 2in;margin:0}
    .label{width:4in;height:2in;padding:10px 12px;gap:12px}
    .qr{width:1.3in;height:1.3in}
    .qr img{width:1.3in;height:1.3in}
    .title{font-size:11px}
    .line{font-size:10px}
  }`

src = src.replace(oldStyle, newStyle)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Label layout fixed - px for screen, in for print')
