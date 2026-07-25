import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

const oldCatch = `    } catch(_) { return it }
  }))`

if (!src.includes(oldCatch)) { console.error('Catch block not found'); process.exit(1) }

const newCatch = `    } catch(err) { console.warn('Invoice image fetch failed for', it.title, imgSrc, err.message); return it }
  }))`

src = src.replace(oldCatch, newCatch)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Added debug logging for image fetch failures')
