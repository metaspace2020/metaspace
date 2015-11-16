from mock import patch, mock_open, mock, Mock, MagicMock
from numpy.testing import assert_array_equal, assert_array_almost_equal
import pytest
from collections import defaultdict
from scipy.sparse.csr import csr_matrix
import json
from collections import OrderedDict
from pyspark import SparkContext
import numpy as np
from os.path import join

from engine.search_job import SearchJob, insert_job_sql
from engine.dataset import Dataset
from engine.formulas import Formulas
from engine.db import DB


data_dir_path = '../data/test_search_job'


@pytest.fixture
def create_fill_sm_database():
    pass


def test_search_results(create_fill_sm_database):
    with patch('engine.search_job.SparkContext') as sc_mock:
        sc_mock.return_value = SparkContext(master='local[2]')

        sm_config = {
            "db": {'host': "localhost",
                   'database': "sm_test",
                   'user': "sm",
                   'password': "1321"}
        }

        ds_config = {}


        job = SearchJob(join(data_dir_path, 'ds.txt'), join(data_dir_path, 'ds_coord.txt'), ds_config, sm_config)
        job.run()