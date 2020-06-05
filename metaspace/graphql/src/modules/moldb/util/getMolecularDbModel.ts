import {Context} from '../../../context';
import {MolecularDB as MolecularDBModel} from '../model';
import * as DataLoader from 'dataloader';
import * as _ from 'lodash';

export const getMolecularDbModel = async (ctx: Context, id: number): Promise<MolecularDBModel> => {
  const dataLoader = ctx.contextCacheGet('getMolecularDBModelDataLoader', [], () => {
    return new DataLoader(async (databaseIds: number[]): Promise<any[]> => {
      const results = await ctx.entityManager.query(
        `SELECT * FROM public.molecular_db as db WHERE db.id = ANY($1)`, [databaseIds]
      );  // TODO: Add database permission checks
      const keyedResults = _.keyBy(results, 'id');
      return databaseIds.map(id => keyedResults[id]);
    });
  });
  return dataLoader.load(id);
};
