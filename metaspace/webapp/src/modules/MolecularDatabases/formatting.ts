import { sortBy } from 'lodash-es'

import { MolecularDB, MolecularDBDetails } from '../../api/moldb'

export function formatDatabaseLabel(db: MolecularDB) {
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
  group: MolDBsByGroup
}

export function getDatabasesByGroup(metaspaceDBs: MolecularDB[], dbsByGroup: UserGroup[]) : MolDBsByGroup[] {
  return [
    { shortName: 'METASPACE', molecularDatabases: metaspaceDBs },
    ...sortBy(dbsByGroup.map(_ => _.group).filter(_ => _.molecularDatabases.length > 0), 'shortName'),
  ]
}
