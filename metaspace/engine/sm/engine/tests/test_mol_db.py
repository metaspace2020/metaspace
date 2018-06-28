from sm.engine.mol_db import MolecularDB
from sm.engine.tests.util import mol_db, sm_config, ds_config
import pandas as pd
import numpy.testing as npt
from unittest.mock import MagicMock, patch

# def test_peak_generator(mol_db):
#     expected_peak_df = pd.DataFrame(dict(
#         sf_id=[1, 1, 1, 2, 3, 3],
#         adduct=['+H', '+H', '+H', '+Na', '+H', '+H'],
#         peak_i=[0, 1, 2, 0, 0, 1],
#         mz=[100, 101, 102, 200, 150, 151]
#     ), columns=['sf_id', 'adduct', 'peak_i', 'mz'])
#
#     peak_df = pd.DataFrame(MolecularDB.sf_peak_gen(mol_db.sf_df), columns=expected_peak_df.columns)
#     npt.assert_array_equal(peak_df, expected_peak_df)

# def test_ion_peak_df(mol_db):
#     # must be sorted by mz
#     expected_df = pd.DataFrame(dict(
#         sf_id=[1, 1, 1, 3, 3, 2],
#         adduct=['+H', '+H', '+H', '+H', '+H', '+Na'],
#         peak_i=[0, 1, 2, 0, 1, 0],
#         mz=[100, 101, 102, 150, 151, 200]
#     ), columns=['sf_id', 'adduct', 'peak_i', 'mz'])
#
#     npt.assert_array_equal(mol_db.get_ion_peak_df(), expected_df)


# def test_sf_peak_ints(mol_db):
#     assert mol_db.get_sf_peak_ints() == {
#         (1, '+H') : [1, 0.1, 0.05],
#         (2, '+Na'): [1],
#         (3, '+H') : [1, 0.3]
#     }
