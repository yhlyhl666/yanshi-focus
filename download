import fs from 'node:fs/promises'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BookOpen } from 'lucide-react'
import sharp from 'sharp'

const size = 512
const outputDir = path.resolve('build')
const outputPath = path.join(outputDir, 'icon.png')

const icon = React.createElement(
  'svg',
  { xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: `0 0 ${size} ${size}` },
  React.createElement('rect', { width: size, height: size, rx: 92, fill: '#e9604e' }),
  React.createElement(BookOpen, {
    x: 116,
    y: 116,
    width: 280,
    height: 280,
    color: '#ffffff',
    strokeWidth: 1.8,
  }),
)

await fs.mkdir(outputDir, { recursive: true })
await sharp(Buffer.from(renderToStaticMarkup(icon))).png().toFile(outputPath)
console.log(outputPath)
