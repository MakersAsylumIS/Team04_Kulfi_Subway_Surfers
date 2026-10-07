// Copies the Adafruit GFX fonts the pet uses (FreeSans, FreeSansBold) into the pet screen
// lab, so the lab draws text pixel for pixel the way the pet will: same glyphs, same
// spacing, no smoothing. Output: src/lab/gfxFonts.json.
//
// Usage:  node scripts/convert-gfx-fonts.mjs <Adafruit_GFX_Library folder>
//   e.g.  node scripts/convert-gfx-fonts.mjs "%USERPROFILE%\Documents\Arduino\libraries\Adafruit_GFX_Library"

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const lib = process.argv[2]
if (!lib) {
  console.error('usage: node scripts/convert-gfx-fonts.mjs <Adafruit_GFX_Library folder>')
  process.exit(1)
}
const NAMES = [9, 12, 18, 24].flatMap((pt) => [`FreeSans${pt}pt7b`, `FreeSansBold${pt}pt7b`])

const out = {}
for (const name of NAMES) {
  const src = readFileSync(join(lib, 'Fonts', `${name}.h`), 'utf8')
  const bitmapBody = src.match(new RegExp(`${name}Bitmaps\\[\\][^{]*\\{([^}]*)\\}`))[1]
  const bitmap = [...bitmapBody.matchAll(/0x([0-9A-Fa-f]{2})/g)].map((m) => m[1].toLowerCase()).join('')
  const glyphBody = src.match(new RegExp(`${name}Glyphs\\[\\][^{]*\\{([\\s\\S]*?)\\};`))[1]
  const glyphs = [...glyphBody.matchAll(/\{\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\}/g)].map((m) =>
    m.slice(1, 7).map(Number),
  )
  const font = src.match(/0x([0-9A-Fa-f]+),\s*0x([0-9A-Fa-f]+),\s*(\d+)\s*\};\s*(\/\/.*)?\s*$/m)
  if (!font) throw new Error(`Couldn't read ${name}'s first/last/yAdvance`)
  out[name] = { bitmap, glyphs, first: parseInt(font[1], 16), last: parseInt(font[2], 16), yAdvance: Number(font[3]) }
  console.log(`${name}: ${glyphs.length} glyphs, ${bitmap.length / 2} bytes`)
}
writeFileSync('src/lab/gfxFonts.json', JSON.stringify(out))
