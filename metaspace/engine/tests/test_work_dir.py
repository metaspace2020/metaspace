from unittest.mock import MagicMock
import json
from os import listdir
from os.path import join, basename
from subprocess import check_call
import pytest
from fabric.api import local
from fabric.context_managers import lcd, warn_only

from sm.engine.util import SMConfig
from sm.engine.work_dir import WorkDirManager, S3WorkDir
from sm.engine.tests.util import sm_config

ds_id = '2000-01-01_00h00m'
input_local_path = join(sm_config()['fs']['base_path'], 'test_input_path')
input_remote_path = 's3a://somepath.com/archive'
data_dir_path = sm_config()['fs']['base_path']
ds_path = join(data_dir_path, ds_id)


def create_sample_files(path, copy_config=True):
    local('mkdir -p {}'.format(path))
    with lcd(path):
        local(' echo "FOO!" > foo.imzML')
        local(' echo "FOO!" > foo.ibd')
        local(' echo "FOO!" > meta.json')

        if copy_config:
            with open(join(path, 'config.json'), 'w') as f:
                f.write(json.dumps({}))


@pytest.fixture()
def clear_files(request):
    def fin():
        with warn_only():
            local('rm -rf {}'.format(input_local_path))
            local('rm -rf {}'.format(ds_path))

    request.addfinalizer(fin)


def test_work_dir_copy_input_data_no_files_local_path(clear_files, sm_config):
    create_sample_files(input_local_path)

    SMConfig._config_dict = sm_config
    work_dir_man = WorkDirManager('2000-01-01_00h00m')
    work_dir_man.copy_input_data(input_local_path)

    file_list = set(listdir(ds_path))
    assert file_list == {'foo.imzML', 'foo.ibd', 'config.json', 'meta.json'}


def test_work_dir_upload_to_remote_leaves_meta_config_files(clear_files, sm_config):
    create_sample_files(input_local_path)

    SMConfig._config_dict = sm_config
    SMConfig._config_dict['fs']['s3_base_path'] = 's3://some-bucket/'
    work_dir_man = WorkDirManager('2000-01-01_00h00m')
    work_dir_man.remote_dir = MagicMock(S3WorkDir)

    work_dir_man.copy_input_data(input_local_path)
    work_dir_man.upload_to_remote()

    file_list = set(listdir(ds_path))
    assert file_list == {'foo.imzML', 'foo.ibd', 'config.json', 'meta.json'}


# def test_work_dir_copy_input_data_files_exist(clear_files, sm_config):
#     create_sample_files(input_local_path)
#     create_sample_files(ds_path, copy_config=False)
#
#     SMConfig._config_dict = sm_config
#     work_dir_man = WorkDirManager(ds_id)
#     work_dir_man.copy_input_data(input_local_path, join(input_local_path, 'config.json'))
#
#     file_list = set(listdir(ds_path))
#     assert file_list == {'foo.imzML', 'foo.ibd', 'config.json', 'meta.json'}