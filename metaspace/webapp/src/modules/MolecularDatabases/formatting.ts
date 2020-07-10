import { MolecularDB } from '../../api/moldb'

export function formatDatabaseLabel(db: MolecularDB) {
  let label = ''
  if (db.name) {
    label += db.name
  }
  if (db.version && db.group) {
    label += ` (${db.version})`
  }
  return label
}
