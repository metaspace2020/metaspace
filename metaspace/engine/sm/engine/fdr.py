import logging
from itertools import product

import numpy as np
import pandas as pd

from sm.engine.formula_parser import format_modifiers

logger = logging.getLogger('engine')

DECOY_ADDUCTS = [
    '+He',
    '+Li',
    '+Be',
    '+B',
    '+C',
    '+N',
    '+O',
    '+F',
    '+Ne',
    '+Mg',
    '+Al',
    '+Si',
    '+P',
    '+S',
    '+Cl',
    '+Ar',
    '+Ca',
    '+Sc',
    '+Ti',
    '+V',
    '+Cr',
    '+Mn',
    '+Fe',
    '+Co',
    '+Ni',
    '+Cu',
    '+Zn',
    '+Ga',
    '+Ge',
    '+As',
    '+Se',
    '+Br',
    '+Kr',
    '+Rb',
    '+Sr',
    '+Y',
    '+Zr',
    '+Nb',
    '+Mo',
    '+Ru',
    '+Rh',
    '+Pd',
    '+Ag',
    '+Cd',
    '+In',
    '+Sn',
    '+Sb',
    '+Te',
    '+I',
    '+Xe',
    '+Cs',
    '+Ba',
    '+La',
    '+Ce',
    '+Pr',
    '+Nd',
    '+Sm',
    '+Eu',
    '+Gd',
    '+Tb',
    '+Dy',
    '+Ho',
    '+Ir',
    '+Th',
    '+Pt',
    '+Os',
    '+Yb',
    '+Lu',
    '+Bi',
    '+Pb',
    '+Re',
    '+Tl',
    '+Tm',
    '+U',
    '+W',
    '+Au',
    '+Er',
    '+Hf',
    '+Hg',
    '+Ta',
]


def _make_target_modifiers_df(chem_mods, neutral_losses, target_adducts):
    """
    All combinations of chemical modification, neutral loss or target adduct.
    Note that the combination order matters as these target modifiers are used later
    to map back to separated chemical modification, neutral loss and target adduct fields.
    """
    rows = [
        (cm, nl, ta, format_modifiers(cm, nl, ta), format_modifiers(cm, nl))
        for cm, nl, ta in product(['', *chem_mods], ['', *neutral_losses], target_adducts)
    ]
    df = pd.DataFrame(
        rows,
        columns=['chem_mod', 'neutral_loss', 'adduct', 'target_modifier', 'decoy_modifier_prefix'],
        dtype='O',
    )
    df = df.set_index('target_modifier')
    return df


class FDR:
    fdr_levels = [0.05, 0.1, 0.2, 0.5]

    def __init__(self, fdr_config, chem_mods, neutral_losses, target_adducts, analysis_version):
        self.decoy_sample_size = fdr_config['decoy_sample_size']
        self.chem_mods = chem_mods
        self.neutral_losses = neutral_losses
        self.target_adducts = target_adducts
        self.analysis_version = analysis_version
        self.td_df = None
        self.random_seed = 42
        self.target_modifiers_df = _make_target_modifiers_df(
            chem_mods, neutral_losses, target_adducts
        )

    def _choose_decoys(self, decoys):
        copy = decoys.copy()
        np.random.shuffle(copy)
        return copy[: self.decoy_sample_size]

    def _decoy_adduct_gen(self, target_formulas, decoy_adducts_cand):
        np.random.seed(self.random_seed)
        target_modifiers = list(self.target_modifiers_df.decoy_modifier_prefix.items())
        # pylint: disable=invalid-name
        for formula, (tm, dm_prefix) in product(target_formulas, target_modifiers):
            for da in self._choose_decoys(decoy_adducts_cand):
                yield (formula, tm, dm_prefix + da)

    def decoy_adducts_selection(self, target_formulas):
        decoy_adduct_cand = [add for add in DECOY_ADDUCTS if add not in self.target_adducts]
        self.td_df = pd.DataFrame(
            self._decoy_adduct_gen(target_formulas, decoy_adduct_cand),
            columns=['formula', 'tm', 'dm'],
        )

    def ion_tuples(self):
        """Returns list of tuples in List[(formula, modifier)] form.

        All ions needed for FDR calculation as a list of (formula, modifier),
        where modifier is a combination of chemical modification, neutral loss and adduct
        """
        d_ions = self.td_df[['formula', 'dm']].drop_duplicates().values.tolist()
        t_ions = self.td_df[['formula', 'tm']].drop_duplicates().values.tolist()
        return list(map(tuple, t_ions + d_ions))

    def target_modifiers(self):
        """ List of possible modifier values for target ions """
        return self.target_modifiers_df.index.tolist()

    @classmethod
    def nearest_fdr_level(cls, fdr):
        for level in cls.fdr_levels:
            if round(fdr, 2) <= level:
                return level
        return 1.0

    @staticmethod
    def _msm_fdr_map(target_msm, decoy_msm):
        target_msm_hits = pd.Series(target_msm.msm.value_counts(), name='target')
        decoy_msm_hits = pd.Series(decoy_msm.msm.value_counts(), name='decoy')
        msm_df = (
            pd.concat([target_msm_hits, decoy_msm_hits], axis=1)
            .fillna(0)
            .sort_index(ascending=False)
        )
        msm_df['target_cum'] = msm_df.target.cumsum()
        msm_df['decoy_cum'] = msm_df.decoy.cumsum()
        msm_df['fdr'] = msm_df.decoy_cum / msm_df.target_cum
        return msm_df.fdr

    def _digitize_fdr(self, fdr_df):
        if self.analysis_version < 2:
            df = fdr_df.copy().sort_values(by='msm', ascending=False)
            msm_levels = [df[df.fdr < fdr_thr].msm.min() for fdr_thr in self.fdr_levels]
            df['fdr_d'] = 1.0
            for msm_thr, fdr_thr in zip(msm_levels, self.fdr_levels):
                row_mask = np.isclose(df.fdr_d, 1.0) & np.greater_equal(df.msm, msm_thr)
                df.loc[row_mask, 'fdr_d'] = fdr_thr
            df['fdr'] = df.fdr_d
            return df.drop('fdr_d', axis=1)

        df = fdr_df.sort_values(by='msm')
        df['fdr'] = np.minimum.accumulate(df.fdr)  # pylint: disable=no-member
        return df

    def estimate_fdr(self, formula_msm):
        logger.info('Estimating FDR')

        td_df = self.td_df.set_index('tm')

        target_fdr_df_list = []
        for tm in self.target_modifiers_df.index.drop_duplicates():  # pylint: disable=invalid-name
            target_msm = formula_msm[formula_msm.modifier == tm]
            full_decoy_df = td_df.loc[tm, ['formula', 'dm']]

            msm_fdr_list = []
            for i in range(self.decoy_sample_size):
                decoy_subset_df = full_decoy_df[i :: self.decoy_sample_size]
                decoy_msm = pd.merge(
                    formula_msm,
                    decoy_subset_df,
                    left_on=['formula', 'modifier'],
                    right_on=['formula', 'dm'],
                )
                msm_fdr = self._msm_fdr_map(target_msm, decoy_msm)
                msm_fdr_list.append(msm_fdr)

            msm_fdr_avg = pd.Series(pd.concat(msm_fdr_list, axis=1).median(axis=1), name='fdr')
            target_fdr = self._digitize_fdr(target_msm.join(msm_fdr_avg, on='msm'))
            target_fdr_df_list.append(target_fdr.drop('msm', axis=1))

        return pd.concat(target_fdr_df_list, axis=0)
