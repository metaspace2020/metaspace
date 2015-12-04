import pytest
from os.path import join, realpath, dirname
from os import listdir
from fabric.api import local
from fabric.context_managers import lcd, warn_only

from engine.search_job import WorkDir
from engine.test.util import ds_config, sm_config


input_path = join(sm_config()['fs']['data_dir'], 'test_input_path')
ds_path = join(sm_config()['fs']['data_dir'], 'test_ds_path')


def create_sample_files(path):
    local('mkdir -p {}'.format(path))
    with lcd(path):
        local(' echo "FOO!" > foo.imzML')
        local(' echo "FOO!" > foo.ibd')
        local(' echo "FOO!" > config.json')


@pytest.fixture()
def clear_files(request):
    def fin():
        with warn_only():
            local('rm -rf {}'.format(input_path))
            local('rm -rf {}'.format(ds_path))
    request.addfinalizer(fin)


def test_work_dir_copy_input_data_no_files(ds_config, sm_config, clear_files):
    create_sample_files(input_path)

    ds_config['name'] = 'test_ds_path'
    work_dir = WorkDir(ds_config, data_dir_path=sm_config['fs']['data_dir'])
    work_dir.copy_input_data(input_path)

    file_list = set(listdir(ds_path))
    assert file_list == {'foo.imzML', 'foo.ibd', 'config.json'}


def test_work_dir_copy_input_data_files_exist(ds_config, sm_config, clear_files):
    create_sample_files(ds_path)

    ds_config['name'] = 'test_ds_path'
    work_dir = WorkDir(ds_config, data_dir_path=sm_config['fs']['data_dir'])
    work_dir.copy_input_data(input_path)

    file_list = set(listdir(ds_path))
    assert file_list == {'foo.imzML', 'foo.ibd', 'config.json'}
