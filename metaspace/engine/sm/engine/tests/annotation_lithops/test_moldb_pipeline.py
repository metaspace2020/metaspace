from typing import List
from unittest.mock import patch
import pandas as pd

from sm.engine.annotation_lithops.build_moldb import InputMolDb
from tests.conftest import executor, sm_config, ds_config
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import save_cobj, load_cobjs
from sm.engine.annotation_lithops.moldb_pipeline import get_moldb_centroids

# Mock CentroidsCacheEntry.lock so that a DB connection isn't needed
@patch('sm.engine.annotation_lithops.moldb_pipeline.CentroidsCacheEntry.lock')
def test_get_moldb_centroids(LockMock, executor: Executor, sm_config, ds_config):
    formulas0 = ['H2O', 'CO2']
    formulas1 = ['H2SO4', 'CO2']
    formulas2 = ['H2SO4', 'NH4']
    moldbs: List[InputMolDb] = [
        {'id': 0, 'targeted': False, 'cobj': save_cobj(executor.storage, formulas0)},
        {'id': 1, 'targeted': True, 'cobj': save_cobj(executor.storage, formulas1)},
        {'id': 2, 'targeted': False, 'cobj': save_cobj(executor.storage, formulas2)},
    ]

    db_data_cobjs, peaks_cobjs = get_moldb_centroids(
        executor,
        sm_config['lithops']['sm_storage'],
        ds_config,
        moldbs,
        debug_validate=True,
        use_cache=False,
    )

    db_data = load_cobjs(executor.storage, db_data_cobjs)
    peaks_df = pd.concat(load_cobjs(executor.storage, peaks_cobjs))

    map_df0 = db_data[0]['formula_map_df'].set_index(['formula', 'modifier'])
    map_df1 = db_data[1]['formula_map_df'].set_index(['formula', 'modifier'])
    map_df2 = db_data[2]['formula_map_df'].set_index(['formula', 'modifier'])
    h2o_formula_i0 = map_df0.loc[('H2O', '')].formula_i
    co2_formula_i0 = map_df0.loc[('CO2', '')].formula_i
    co2_formula_i1 = map_df1.loc[('CO2', '')].formula_i
    h2so4_formula_i1 = map_df1.loc[('H2SO4', '')].formula_i
    h2so4_formula_i2 = map_df2.loc[('H2SO4', '')].formula_i
    assert co2_formula_i0 == co2_formula_i1, 'formula_i values should be de-duplicated'
    assert h2so4_formula_i1 == h2so4_formula_i2, 'formula_i values should be de-duplicated'
    assert co2_formula_i0 != h2so4_formula_i2, 'formula_i values should not conflict'

    assert not peaks_df.loc[
        h2o_formula_i0
    ].targeted.any(), "H2O shouldn't be targeted as it's not in a targeted DB"
    assert peaks_df.loc[
        co2_formula_i0
    ].targeted.any(), "CO2 should be targeted as it's in a targeted DB"
    assert peaks_df.loc[
        h2so4_formula_i1
    ].targeted.any(), "H2SO4 should be targeted as it's in a targeted DB"
