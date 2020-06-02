import {MolecularDB as MolecularDbModel} from '../model';
import {MolecularDB} from '../../../binding';
import config from '../../../utils/config';

export const mapToMolecularDB = (moldb: MolecularDbModel): MolecularDB => {
  return {
    ...moldb,
    description: moldb.description || undefined,
    fullName: moldb.fullName || undefined,
    link: moldb.link || undefined,
    citation: moldb.citation || undefined,
    default: config.defaults.moldb_names.includes(moldb.name),
    hidden: moldb.archived || !moldb.public,
  }
};