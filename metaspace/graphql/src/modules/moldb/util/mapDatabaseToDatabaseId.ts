import { EntityManager } from 'typeorm'
import { MolecularDB as MolecularDbModel } from '../../moldb/model'
import logger from '../../../utils/logger'

export const mapDatabaseToDatabaseId =
  async(entityManager: EntityManager, database: string): Promise<number> => {
    logger.warn('Addressing private databases by name was deprecated. Use database id instead.')

    /* eslint-disable quote-props */
    const databaseNameVersionMapping = {
      'ChEBI': ['ChEBI', '2016'],
      'LIPID_MAPS': ['LIPID_MAPS', '2016'],
      'SwissLipids': ['SwissLipids', '2016'],
      'HMDB-v2.5': ['HMDB', 'v2.5'],
      'HMDB-v2.5-cotton': ['HMDB-cotton', 'v2.5'],
      'BraChemDB-2018-01': ['BraChemDB', '2018-01'],
      'ChEBI-2018-01': ['ChEBI', '2018-01'],
      'HMDB-v4': ['HMDB', 'v4'],
      'HMDB-v4-endogenous': ['HMDB-endogenous', 'v4'],
      'LipidMaps-2017-12-12': ['LipidMaps', '2017-12-12'],
      'PAMDB-v1.0': ['PAMDB', 'v1.0'],
      'SwissLipids-2018-02-02': ['SwissLipids', '2018-02-02'],
      'HMDB-v4-cotton': ['HMDB-cotton', 'v4'],
      'ECMDB-2018-12': ['ECMDB', '2018-12'],
    } as any

    const { name, version } = databaseNameVersionMapping[database]
    const databaseModel = await entityManager.findOneOrFail(MolecularDbModel, { name, version })
    return databaseModel.id
  }
