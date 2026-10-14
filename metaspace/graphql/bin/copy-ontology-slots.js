// Copies metadataSchemas/ontology_slots.json (slot -> ontology root bindings, owned by graphql) into
// the engine package, validating it on the way. Same pattern as dump-sql-schema.js: the engine copy
// is generated, never hand-edited, and CI fails when it is stale.
//   yarn gen-ontology-slots
const fs = require('fs')
const path = require('path')

const source = path.join(__dirname, '..', 'metadataSchemas', 'ontology_slots.json')
const target = process.argv[2] || path.join(__dirname, '..', '..', 'engine', 'sm', 'engine', 'ontology_slots.json')

const slots = JSON.parse(fs.readFileSync(source, 'utf8'))
for (const [slot, bindings] of Object.entries(slots)) {
  if (!Array.isArray(bindings) || bindings.length === 0) {
    throw new Error(`ontology_slots.json: slot "${slot}" must bind at least one root`)
  }
  for (const binding of bindings) {
    for (const key of ['ontology', 'root', 'obo_file']) {
      if (typeof binding[key] !== 'string' || binding[key] === '') {
        throw new Error(`ontology_slots.json: slot "${slot}" binding is missing "${key}"`)
      }
    }
  }
}
fs.writeFileSync(target, JSON.stringify(slots, null, 2) + '\n')
console.log(`Wrote ${Object.keys(slots).length} slots to ${path.relative(process.cwd(), target)}`)
