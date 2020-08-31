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

interface UserGroup {
  group: {
    id: string
    shortName: string
  }
}

export function getDatabasesByGroup(molDBs: MolecularDB[], groups: UserGroup[]) : MolDBsByGroup[] {
  const metaspaceDBs = []
  const groupedDBs: Record<string, MolecularDB[]> = {}

  for (const db of molDBs) {
    if (db.group === null) {
      metaspaceDBs.push(db)
    } else if (db.group.id in groupedDBs) {
      groupedDBs[db.group.id].push(db)
    } else {
      groupedDBs[db.group.id] = [db]
    }
  }

  return [
    { shortName: 'METASPACE', molecularDatabases: metaspaceDBs },
    ...sortBy(
      groups
        .filter(({ group }) => group.id in groupedDBs)
        .map(({ group }) => ({ ...group, molecularDatabases: groupedDBs[group.id] })),
      'shortName',
    ),
  ]
}
