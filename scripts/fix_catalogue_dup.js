import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Catalogue.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Find and remove the duplicate block between the sort pills closing and the real Works grid
// The broken block looks like:
// {/* Works grid */}
// {artistWorks.length === 0
//       Clear
//     </button>
//   )}
// </div>
//
// {/* Works grid */}

const brokenBlock = `          {/* Works grid */}
          {artistWorks.length === 0
                Clear
              </button>
            )}
          </div>

          {/* Works grid */}
          {artistWorks.length === 0`

if (src.includes(brokenBlock)) {
  src = src.replace(brokenBlock, `          {/* Works grid */}
          {artistWorks.length === 0`)
  console.log('Removed duplicate block')
} else {
  console.log('Exact block not found, searching for pattern...')
  // Try a regex to find Clear button remnant between two Works grid comments
  const pattern = /\{\/\* Works grid \*\/\}\s*\{artistWorks\.length === 0\s*Clear\s*<\/button>\s*\)\}\s*<\/div>\s*\{\/\* Works grid \*\/\}\s*\{artistWorks\.length === 0/s
  if (pattern.test(src)) {
    src = src.replace(pattern, '{/* Works grid */}\n          {artistWorks.length === 0')
    console.log('Removed duplicate block (regex)')
  } else {
    console.log('Pattern not found either — printing context')
    const idx = src.indexOf('Clear\n')
    if (idx > 0) {
      console.log('Found Clear at index ' + idx)
      console.log(src.slice(idx - 200, idx + 200))
    }
  }
}

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Done')
