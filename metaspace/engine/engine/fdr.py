import numpy as np
import pandas as pd
from cStringIO import StringIO
from engine.util import logger

DECOY_ADDUCTS = ['+He', '+Li', '+Be', '+B', '+C', '+N', '+O', '+F', '+Ne', '+Mg'] #, 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Ir', 'Th', 'Pt', 'Pu', 'Os', 'Yb', 'Lu', 'Bi', 'Pb', 'Re', 'Tl', 'Tm', 'U', 'W', 'Au', 'Er', 'Hf', 'Hg', 'Ta'}
SF_LIST_SEL = ('SELECT af.id '
               'FROM agg_formula af '
               'JOIN formula_db db ON db.id = af.db_id '
               'WHERE db.id = %s')


class FDR(object):

    def __init__(self, job_id, db_id, n, ds_config, db):
        self.job_id = job_id
        self.db_id = db_id
        self.n = n
        self.ds_config = ds_config
        self.db = db
        self.target_adducts = None
        self.td_df = None

    @staticmethod
    def _decoy_adduct_gen(sf_ids, target_adducts, decoy_adducts_cand, n):
        for sf_id in sf_ids:
            for ta in target_adducts:
                for da in np.random.choice(decoy_adducts_cand, size=n, replace=False):
                    yield (sf_id, ta, da)

    def save_target_decoy_df(self):
        buf = StringIO()
        df = self.td_df.copy()
        df.insert(0, 'db_id', self.db_id)
        df.insert(0, 'job_id', self.job_id)
        df.to_csv(buf, index=False, header=False)
        buf.seek(0)
        self.db.copy(buf, 'target_decoy_add', sep=',')

    def decoy_adduct_selection(self):
        sf_ids = [r[0] for r in self.db.select(SF_LIST_SEL, self.db_id)]
        self.target_adducts = self.ds_config['isotope_generation']['adducts']
        decoy_adduct_cand = list(set(DECOY_ADDUCTS) - set(self.target_adducts))
        self.td_df = pd.DataFrame(self._decoy_adduct_gen(sf_ids, self.target_adducts, decoy_adduct_cand, self.n),
                                  columns=['sf_id', 'ta', 'da'])
        self.save_target_decoy_df()

    def msm_fdr_map(self, target_msm, decoy_msm):
        target_msm_hits = pd.Series(target_msm.msm.value_counts(), name='target')
        decoy_msm_hits = pd.Series(decoy_msm.msm.value_counts(), name='decoy')
        msm_df = pd.concat([target_msm_hits, decoy_msm_hits], axis=1).fillna(0).sort_index(ascending=False)
        msm_df['target_cum'] = msm_df.target.cumsum()
        msm_df['decoy_cum'] = msm_df.decoy.cumsum()
        msm_df['fdr'] = msm_df.decoy_cum / msm_df.target_cum
        return msm_df.fdr

    def estimate_fdr(self, sf_df, max_fdr=0.5):
        logger.info('Estimating FDR (max_fdr = %s)', max_fdr)

        msm_df = sf_df.set_index(['sf_id', 'adduct']).sort_index()

        target_msm_fdr_df_list = []
        for ta in self.target_adducts:
            target_msm = msm_df.loc(axis=0)[:,ta]

            msm_fdr_list = []
            for i in range(self.n):
                sf_da_list = map(tuple, self.td_df[self.td_df.ta == ta][['sf_id', 'da']][i::self.n].values)
                decoy_msm = msm_df.loc[sf_da_list]
                msm_fdr = self.msm_fdr_map(target_msm, decoy_msm)
                msm_fdr_list.append(msm_fdr)

            msm_fdr_avg = pd.Series(pd.concat(msm_fdr_list, axis=1).median(axis=1), name='fdr')
            target_msm_fdr = target_msm.join(msm_fdr_avg, on='msm')
            target_msm_fdr_df_list.append(target_msm_fdr[target_msm_fdr.fdr <= max_fdr])

        final_fdr = pd.concat(target_msm_fdr_df_list, axis=0).drop('msm', axis=1)

        return final_fdr.join(sf_df.reset_index().set_index(['sf_id', 'adduct'])).reset_index().set_index('index')

