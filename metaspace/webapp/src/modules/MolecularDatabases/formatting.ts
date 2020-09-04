import { sortBy } from 'lodash-es'

import { MolecularDB, MolecularDBDetails } from '../../api/moldb'

// loose input type for dataset fdrCounts
export function formatDatabaseLabel(db: { name: string, version: string }) {
  let label = ''
  if (db.name) {
    label += db.name
  }
  if (db.version) {
    label += ` - ${db.version}`
  }
  return label
}

export function getDatabaseDetails(database: MolecularDB) : MolecularDBDetails {
  const {
    citation,
    description,
    fullName,
    isPublic,
    link,
  } = database

  return {
    citation,
    description,
    fullName,
    isPublic,
    link,
  }
}

export interface MolDBsByGroup {
  shortName: string
  molecularDatabases: MolecularDB[]
}

export function getDatabasesByGroup(molDBs: MolecularDB[]) : MolDBsByGroup[] {
  const metaspaceDBs = []
  const groups: Record<string, MolDBsByGroup> = {}

  for (const db of molDBs) {
    if (db.group === null) {
      metaspaceDBs.push(db)
    } else if (db.group.id in groups) {
      groups[db.group.id].molecularDatabases.push(db)
    } else {
      groups[db.group.id] = {
        shortName: db.group.shortName,
        molecularDatabases: [db],
      }
    }
  }

  return [
    { shortName: 'METASPACE', molecularDatabases: metaspaceDBs },
    ...sortBy(Object.values(groups), 'shortName'),
  ]
}
