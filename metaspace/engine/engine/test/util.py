import pytest
from pyspark import SparkContext, SparkConf


@pytest.fixture(scope='module')
def spark_context(request):
    sc = SparkContext(master='local[2]', conf=SparkConf())

    def fin():
        sc.stop()
    request.addfinalizer(fin)

    return sc


@pytest.fixture()
def ds_config(request):
    return {
        "name": "test_ds",
        "inputs": {
            "data_file": "test_ds.imzML",
            "database": "HMDB"
        },
        "isotope_generation": {
            "adducts": ["+H", "+Na"],
            "charge": {
                "polarity": "+",
                "n_charges": 1
            },
            "isocalc_sig": 0.01,
            "isocalc_resolution": 200000,
            "isocalc_do_centroid": True
        },
        "image_generation": {
            "ppm": 1.0,
            "nlevels": 30,
            "q": 99,
            "do_preprocessing": False
        },
        "image_measure_thresholds": {
            "measure_of_chaos": -1.0,
            "image_corr": -1.0,
            "pattern_match": -1.0
        }
    }


@pytest.fixture()
def sm_config(request):
    return {
        "db": {
            "host": "localhost",
            "database": "sm_test",
            "user": "sm",
            "password": "1321"
        }
    }
