// Copies metadataSchemas/analyzer_classes.json (the analyzer class a free-text Analyzer label falls into, owned by
// graphql) into the engine package, validating it on the way. Same pattern as copy-ontology-slots.js: the engine
// copy is generated, never hand-edited, and CI fails when it is stale. Order matters: the first class whose
// phrase the label contains wins ('exploris' is listed under Orbitrap and TOF).
//   yarn gen-analyzer-classes
const fs = require('fs')
const path = require('path')

const source = path.join(__dirname, '..', 'metadataSchemas', 'analyzer_classes.json')
const target = process.argv[2] || path.join(__dirname, '..', '..', 'engine', 'sm', 'engine', 'analyzer_classes.json')

const classes = JSON.parse(fs.readFileSync(source, 'utf8'))
if (!Array.isArray(classes) || classes.length === 0) {
  throw new Error('analyzer_classes.json: must be a non-empty array of { class, phrases }')
}
for (const entry of classes) {
  if (typeof entry.class !== 'string' || entry.class === '') {
    throw new Error('analyzer_classes.json: every entry needs a non-empty "class"')
  }
  if (!Array.isArray(entry.phrases) || entry.phrases.length === 0
    || !entry.phrases.every(phrase => typeof phrase === 'string' && phrase === phrase.toLowerCase() && phrase !== '')) {
    throw new Error(`analyzer_classes.json: class "${entry.class}" needs non-empty lower-case "phrases"`)
  }
}
fs.writeFileSync(target, JSON.stringify(classes, null, 2) + '\n')
console.log(`Wrote ${classes.length} analyzer classes to ${path.relative(process.cwd(), target)}`)
