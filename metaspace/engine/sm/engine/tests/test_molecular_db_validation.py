import pandas as pd

from sm.engine.molecular_db import _validate_moldb_df  # pylint: disable=protected-access

MAX_VALUE_LENGTH = 2500


def _moldb_df(**overrides):
    row = {'id': 'ID1', 'name': 'glucose', 'formula': 'C6H12O6', **overrides}
    return pd.DataFrame([row], dtype=object)


def test_valid_rows_have_no_errors():
    assert _validate_moldb_df(_moldb_df()) == []


def test_long_value_in_unused_column_is_accepted():
    # Public DBs (e.g. ChEBI) have peptide InChIs above the limit; the column is never imported
    df = _moldb_df(inchi='InChI=1S/' + 'C' * (MAX_VALUE_LENGTH + 500))

    assert _validate_moldb_df(df) == []


def test_long_value_in_imported_column_is_rejected():
    df = _moldb_df(name='x' * (MAX_VALUE_LENGTH + 1))

    errors = _validate_moldb_df(df)

    assert [e['error'] for e in errors] == ['Value exceeded the maximum number of characters.']
    assert errors[0]['line'] == 2


def test_empty_value_in_any_column_is_rejected():
    errors = _validate_moldb_df(_moldb_df(inchi=' '))

    assert [e['error'] for e in errors] == ['Empty value']
