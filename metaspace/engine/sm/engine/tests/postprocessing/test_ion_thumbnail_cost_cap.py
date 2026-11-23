from unittest.mock import MagicMock, patch

import pytest

from sm.engine.errors import CostLimitError
from sm.engine.postprocessing.ion_thumbnail import generate_ion_thumbnail_lithops


def make_db():
    db = MagicMock()
    db.select_one.return_value = (None,)  # no existing thumbnail
    db.select.return_value = [('image-id', 1, 100.0)]  # one annotation row so executor.call runs
    return db


@patch('sm.engine.postprocessing.ion_thumbnail.SMConfig')
def test_cost_limit_error_propagates_from_thumbnail_step(sm_config_mock):
    executor = MagicMock()
    executor.call.side_effect = CostLimitError(11, 10)
    ds = MagicMock(id='ds_id')

    with pytest.raises(CostLimitError):
        generate_ion_thumbnail_lithops(executor=executor, db=make_db(), ds=ds, only_if_needed=False)

    executor.call.assert_called_once()


@patch('sm.engine.postprocessing.ion_thumbnail.SMConfig')
def test_other_thumbnail_errors_are_still_swallowed(sm_config_mock):
    executor = MagicMock()
    executor.call.side_effect = ValueError('boom')
    ds = MagicMock(id='ds_id')

    generate_ion_thumbnail_lithops(executor=executor, db=make_db(), ds=ds, only_if_needed=False)

    executor.call.assert_called_once()
