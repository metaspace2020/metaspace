import {MolecularDB as MolecularDbModel} from '../model';
import {MolecularDB} from '../../../binding';
import config from '../../../utils/config';

export const mapToMolecularDB = (molDB: MolecularDbModel): MolecularDB => {
  return {
    ...molDB,
    default: config.defaults.moldb_names.includes(molDB.name),
    hidden: molDB.archived || !molDB.public,
  }
};