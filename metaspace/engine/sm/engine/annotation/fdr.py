import logging
from itertools import product
from typing import Optional

import numpy as np
import pandas as pd

from sm.engine.annotation.scoring_model import ScoringModel, MsmScoringModel
from sm.engine.formula_parser import format_modifiers

logger = logging.getLogger('engine')

DECOY_ADDUCTS = [
    # fmt: off
    '+He', '+Li', '+Be', '+B', '+C', '+N', '+O', '+F', '+Ne', '+Mg',
    '+Al', '+Si', '+P', '+S', '+Cl', '+Ar', '+Ca', '+Sc', '+Ti', '+V',
    '+Cr', '+Mn', '+Fe', '+Co', '+Ni', '+Cu', '+Zn', '+Ga', '+Ge', '+As',
    '+Se', '+Br', '+Kr', '+Rb', '+Sr', '+Y', '+Zr', '+Nb', '+Mo', '+Ru',
    '+Rh', '+Pd', '+Ag', '+Cd', '+In', '+Sn', '+Sb', '+Te', '+I', '+Xe',
    '+Cs', '+Ba', '+La', '+Ce', '+Pr', '+Nd', '+Sm', '+Eu', '+Gd', '+Tb',
    '+Dy', '+Ho', '+Ir', '+Th', '+Pt', '+Os', '+Yb', '+Lu', '+Bi', '+Pb',
    '+Re', '+Tl', '+Tm', '+U', '+W', '+Au', '+Er', '+Hf', '+Hg', '+Ta',
    # fmt: on
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
        columns=['chem_mod', 'neutral_loss', 'adduct', 'tm', 'decoy_modifier_prefix'],
        dtype='O',
    )
    df = df.set_index('tm')
    return df


def score_to_fdr_map(
    target_scores: np.ndarray,
    decoy_scores: np.ndarray,
    decoy_ratio: float,
    rule_of_succession: bool,
    monotonic: bool,
) -> pd.Series:
    """Returns a Series where the index is the target/decoy scores and the value is the FDR.
    Scores can have any magnitude, but must be floating point numbers where higher values indicate
    higher confidence.

    target/decoy scores can have any finite values, but it's assumed that higher values indicate
    higher confidence.

    Args:
        target_scores: scores for all targets
        decoy_scores: scores for all decoys
        decoy_ratio: ratio of decoys to targets for the given ranking. This has to be provided
            because `target_scores` and `decoy_scores` usually exclude zero-scored annotations,
            but those excluded values need to be taken into account for the FDR calculation.
            In analysis_version=1, many rankings with matched target/decoy sizes are used,
                so this should be 1
            In analysis_version=3, a single ranking with many decoys is done per target,
                so this should be the decoy_sample_size
        rule_of_succession: When true, starts the sequence with 1 target and 1 decoy,
            which improves stability and solves the overoptimistic "0% FDR" problem.
        monotonic: When true, ensures that there are no cases where having a lower score would
            have a lower FDR. This is generally preferred - false only makes sense if the FDRs
            are going to be somehow manipulated (e.g. averaged over several rankings) before being
            made monotonic.
    """
    target_hits = pd.Series(target_scores, name='target').value_counts()
    decoy_hits = pd.Series(decoy_scores, name='decoy').value_counts()
    counts_df = pd.concat([target_hits, decoy_hits], axis=1).fillna(0).sort_index(ascending=False)
    cumulative_targets = counts_df.target.cumsum()
    cumulative_decoys = counts_df.decoy.cumsum()
    if rule_of_succession:
        # Per the Rule of Succession, to find the best estimate of a
        # Bernoulli distribution's mean, add one to the number of observations of each class.
        # Other FDR algorithms don't seem to do this, and technically this isn't actually a
        # Bernoulli distribution, but it's the best approach I could find to integrate
        # uncertainty into the FDR values to avoid producing misleading 0% FDR values
        # (which likely have a large-but-unreported margin of error).
        cumulative_targets = cumulative_targets + 1
        cumulative_decoys = cumulative_decoys + 1

    fdrs = cumulative_decoys / decoy_ratio / cumulative_targets
    fdrs[cumulative_targets == 0] = 1  # Fix NaNs when decoys come before targets

    if monotonic:
        # FDRs is already sorted by score descending, so reverse it, take the running-minimum,
        # then reverse it again to get the original order.
        fdrs = pd.Series(np.minimum.accumulate(fdrs.values[::-1])[::-1], index=fdrs.index)

    return fdrs


def run_fdr_ranking(
    target_scores: pd.Series,
    decoy_scores: pd.Series,
    decoy_ratio: float,
    rule_of_succession: bool,
    monotonic: bool,
):
    fdr_map = score_to_fdr_map(
        target_scores.values, decoy_scores.values, decoy_ratio, rule_of_succession, monotonic
    )

    fdrs = fdr_map.loc[target_scores.values].values

    return pd.Series(fdrs, index=target_scores.index)


def run_fdr_ranking_labeled(
    scores: pd.Series,
    target: pd.Series,
    decoy_ratio: float,
    rule_of_succession: bool,
    monotonic: bool,
):
    """Runs an FDR ranking for a list of scores with a separate target/decoy flag.
    Returns calculated FDRs for both targets and decoys."""
    fdr_map = score_to_fdr_map(
        scores[target].values, scores[~target].values, decoy_ratio, rule_of_succession, monotonic
    )

    return pd.Series(fdr_map.loc[scores.values].values, index=scores.index)


class FDR:
    fdr_levels = [0.05, 0.1, 0.2, 0.5]

    def __init__(self, fdr_config, chem_mods, neutral_losses, target_adducts, analysis_version):
        self.decoy_adduct_cand = [ad for ad in DECOY_ADDUCTS if ad not in target_adducts]
        self.decoy_sample_size = min(fdr_config['decoy_sample_size'], len(self.decoy_adduct_cand))

        self.chem_mods = chem_mods
        self.neutral_losses = neutral_losses
        self.target_adducts = target_adducts
        self.analysis_version = analysis_version
        self.td_df = None
        self.random_seed = 42
        self.target_modifiers_df = _make_target_modifiers_df(
            chem_mods, neutral_losses, target_adducts
        )

    def _choose_decoys(self):
        copy = self.decoy_adduct_cand.copy()
        np.random.shuffle(copy)
        return copy[: self.decoy_sample_size]

    def _decoy_adduct_gen(self, target_formulas):
        np.random.seed(self.random_seed)
        target_modifiers = list(self.target_modifiers_df.decoy_modifier_prefix.items())
        if self.analysis_version < 3:
            # NOTE: These are later selected by index % decoy_sample_size. Generation order matters.
            # pylint: disable=invalid-name
            for formula, (target_modifier, decoy_prefix) in product(
                target_formulas, target_modifiers
            ):
                for decoy_adduct in self._choose_decoys():
                    yield formula, target_modifier, decoy_prefix + decoy_adduct
        else:
            # In v3, share the decoy adducts, as there's no benefit to re-sampling decoys
            # for each target modifier, but it's significantly expensive to do so.
            for formula in target_formulas:
                decoys = self._choose_decoys()
                for target_modifier, decoy_prefix in target_modifiers:
                    for decoy_adduct in decoys:
                        yield formula, target_modifier, decoy_prefix + decoy_adduct

    def decoy_adducts_selection(self, target_formulas):
        self.td_df = pd.DataFrame(
            self._decoy_adduct_gen(target_formulas),
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

    def _digitize_fdr(self, fdr_df):
        # Bin annotations by predefined FDR thresholds, also making them monotonic
        # This is only used in analysis_version==1
        df = fdr_df.sort_values(by='msm', ascending=False)
        msm_levels = [df[df.fdr < fdr_thr].msm.min() for fdr_thr in self.fdr_levels]
        df['fdr_d'] = 1.0
        for msm_thr, fdr_thr in zip(msm_levels, self.fdr_levels):
            row_mask = np.isclose(df.fdr_d, 1.0) & np.greater_equal(df.msm, msm_thr)
            df.loc[row_mask, 'fdr_d'] = fdr_thr
        df['fdr'] = df.fdr_d
        return df.drop('fdr_d', axis=1)

    def estimate_fdr(
        self, formula_msm: pd.DataFrame, scoring_model: Optional[ScoringModel]
    ) -> pd.DataFrame:
        logger.info('Estimating FDR')

        if scoring_model is None:
            scoring_model = MsmScoringModel()

        td_df = self.td_df.set_index('tm')

        target_fdr_df_list = []
        for tm in self.target_modifiers_df.index.drop_duplicates():  # pylint: disable=invalid-name
            target_msm = formula_msm[formula_msm.modifier == tm]
            full_decoy_df = td_df.loc[tm, ['formula', 'dm']].rename(columns={'dm': 'modifier'})

            if self.analysis_version >= 3:
                # Do a single big ranking with all the decoys, numerically compensating for the
                # imbalanced sets sizes. This is equivalent to averaging across the different random
                # sets of decoys.
                decoy_msm = pd.merge(formula_msm, full_decoy_df, on=['formula', 'modifier'])
                target_df, decoy_df = scoring_model.score(
                    target_msm, decoy_msm, self.decoy_sample_size
                )

                fdr_vals = run_fdr_ranking(
                    target_df.msm, decoy_df.msm, self.decoy_sample_size, True, True
                )
                target_fdr = target_df.assign(fdr=fdr_vals)
            else:
                # Do a separate ranking for each of the 20 target:decoy pairings, then take the
                # median FDR for each target
                fdr_vals_list = []
                for i in range(self.decoy_sample_size):
                    decoy_subset_df = full_decoy_df[i :: self.decoy_sample_size]
                    decoy_msm = pd.merge(formula_msm, decoy_subset_df, on=['formula', 'modifier'])

                    # Extra columns added by scoring_model are discarded for simplicity,
                    # as it's unlikely anyone will use this codepath with a CatBoost model
                    target_df, decoy_df = scoring_model.score(target_msm, decoy_msm, 1)

                    fdr_vals = run_fdr_ranking(target_df.msm, decoy_df.msm, 1, False, False)
                    fdr_vals_list.append(fdr_vals)

                msm_to_fdr = pd.Series(pd.concat(fdr_vals_list, axis=1).median(axis=1), name='fdr')
                target_fdr = self._digitize_fdr(target_msm.join(msm_to_fdr))
            target_fdr_df_list.append(target_fdr)

        return pd.concat(target_fdr_df_list)
