import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const distDir = path.resolve('dist')
const entryPath = path.join(distDir, 'index.html')
const entryUrl = pathToFileURL(entryPath)
const html = fs.readFileSync(entryPath, 'utf8')
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => reference.includes('assets'))

const failures = references.flatMap((reference) => {
  const resolvedPath = fileURLToPath(new URL(reference, entryUrl))
  const relativePath = path.relative(distDir, resolvedPath)
  const outsideDist = relativePath.startsWith('..') || path.isAbsolute(relativePath)
  const exists = fs.existsSync(resolvedPath)
  return outsideDist || !exists ? [{ reference, resolvedPath, outsideDist, exists }] : []
})

if (!references.length || failures.length) {
  console.error('Desktop asset check failed:', { references, failures })
  process.exit(1)
}

console.log('Desktop asset check passed:', references)
