import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const storyPath = path.resolve(dirname, '../src/data/story.ts')
const source = fs.readFileSync(storyPath, 'utf8')

const nodeMatches = [...source.matchAll(/^  ([A-Za-z0-9_]+): \{([\s\S]*?)(?=^  [A-Za-z0-9_]+: \{|^};)/gm)]
const nodes = new Map(nodeMatches.map(match => [match[1], match[2]]))
const errors = []

if (nodes.size === 0) {
  errors.push('No story nodes found.')
}

const edges = new Map()
for (const [nodeId, body] of nodes) {
  const targets = [...body.matchAll(/\bnext: '([^']+)'/g)].map(match => match[1])
  edges.set(nodeId, targets)

  for (const target of targets) {
    if (!nodes.has(target)) {
      errors.push(`${nodeId} points to missing node ${target}.`)
    }
  }
}

const reachable = new Set()
const visit = nodeId => {
  if (reachable.has(nodeId) || !nodes.has(nodeId)) return
  reachable.add(nodeId)
  for (const target of edges.get(nodeId) || []) visit(target)
}
visit('opening')

for (const nodeId of nodes.keys()) {
  if (!reachable.has(nodeId)) {
    errors.push(`${nodeId} is not reachable from opening.`)
  }
}

const endingNames = []
for (const [, body] of nodes) {
  const endingName = body.match(/\bendingName: '([^']+)'/)
  if (endingName) endingNames.push(endingName[1])
}

const uniqueEndingNames = new Set(endingNames)
const hasFixedBadEnding = uniqueEndingNames.has('回溯') || uniqueEndingNames.has('\\u56de\\u6eaf')
if (uniqueEndingNames.size !== 1 || !hasFixedBadEnding) {
  errors.push('First playthrough should have exactly one fixed bad ending: 回溯.')
}

const loopRestart = nodes.get('loop_restart') || ''
if (!/\bisEnding: true\b/.test(loopRestart)) {
  errors.push('loop_restart must be the actual ending node.')
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`Story tree OK: ${nodes.size} nodes, ${[...edges.values()].flat().length} edges, ${uniqueEndingNames.size} ending.`)
