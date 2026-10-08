import logging
from dataclasses import fields

from sm.engine.annotation.formula_validator import Metrics
from sm.engine.ion_mapping import get_ion_id_mapping
from sm.engine.utils.numpy_json_encoder import numpy_json_dumps

logger = logging.getLogger('engine')
METRICS_INS = (
    'INSERT INTO annotation ('
    '   job_id, formula, chem_mod, neutral_loss, adduct, msm, fdr, stats, iso_image_ids, ion_id'
    ') '
    'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)'
)
ANNOTATION_SEL = 'SELECT * FROM annotation WHERE job_id = %s'

METRICS_FIELDS = [
    *[f.name for f in [*fields(Metrics)] if f.name != 'formula_i' and f.name != 'msm'],
    'chaos_fdr',
    'spatial_fdr',
    'spectral_fdr',
    'mz_err_abs_fdr',
    'mz_err_rel_fdr',
]


class SearchResults:
    """Container for molecule search results."""

    def __init__(self, ds_id: str, job_id: int, n_peaks: int, charge: int):
        """
        Args:
            ds_id: dataset id
            job_id: annotation job id
            n_peaks: number of isotopic peaks
            charge: charge of ions
        """
        self.ds_id = ds_id
        self.job_id = job_id
        self.n_peaks = n_peaks
        self.charge = charge

    @staticmethod
    def _metrics_table_row_gen(job_id, metr_df, ion_image_ids, ion_mapping):
        stats_cols = [f for f in METRICS_FIELDS if f in metr_df.columns]
        for _, row in metr_df.iterrows():
            metr_json = numpy_json_dumps({m: row[m] for m in stats_cols})
            if row.formula_i not in ion_image_ids:
                logger.debug(f'Missing "formula_i": {row}, {ion_image_ids}')
            image_ids = ion_image_ids[row.formula_i]
            yield (
                job_id,
                row.formula,
                row.chem_mod,
                row.neutral_loss,
                row.adduct,
                float(row.msm),
                float(row.fdr),
                metr_json,
                image_ids,
                ion_mapping[row.formula, row.chem_mod, row.neutral_loss, row.adduct],
            )

    def store_ion_metrics(self, ion_metrics_df, ion_image_ids, db):
        """Store ion metrics and iso image ids in the database."""

        logger.info('Storing iso image metrics')

        ions = ion_metrics_df[['formula', 'chem_mod', 'neutral_loss', 'adduct']]
        ion_tuples = list(ions.itertuples(False, None))
        ion_mapping = get_ion_id_mapping(db, ion_tuples, self.charge)

        rows = self._metrics_table_row_gen(
            self.job_id, ion_metrics_df.reset_index(), ion_image_ids, ion_mapping
        )
        db.insert(METRICS_INS, list(rows))

    def get_annotations_ids(self, db):
        return db.select_with_fields(ANNOTATION_SEL, (self.job_id,))
