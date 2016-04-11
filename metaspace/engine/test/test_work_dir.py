import pytest
from mock import patch
from os.path import join, realpath, dirname, basename
from os import listdir
from fabric.api import local
from fabric.context_managers import lcd, warn_only
import json
from subprocess import check_call
from engine.search_job import WorkDir
from engine.test.util import ds_config, sm_config

ds_name = 'test_ds'
input_local_path = join(sm_config()['fs']['data_dir'], 'test_input_path')
input_remote_path = 's3://somepath.com/archive'
data_dir_path = sm_config()['fs']['data_dir']
ds_path = join(data_dir_path, ds_name)


def create_sample_files(path):
    local('mkdir -p {}'.format(path))
    with lcd(path):
        local(' echo "FOO!" > foo.imzML')
        local(' echo "FOO!" > foo.ibd')

        with open(join(path, 'config.json'), 'w') as f:
            f.write(json.dumps({}))


@pytest.fixture()
def clear_files(request):
    def fin():
        with warn_only():
            local('rm -rf {}'.format(input_local_path))
            local('rm -rf {}'.format(ds_path))

    request.addfinalizer(fin)


def check_call_side_effect(args):
    if args[0] == 'wget':
        _, inp_path, _, out_path = args
        with lcd(input_local_path):
            local('zip {} foo.* config.json'.format(basename(out_path)))
            local('cp {} {}'.format(basename(out_path), '../tmp'))
    else:
        check_call(args)


# @patch('engine.util.check_call', side_effect=check_call_side_effect)
# def test_work_dir_copy_input_data_no_files_remote_path(check_call_mock, clear_files):
#     create_sample_files(input_local_path)
#
#     work_dir = WorkDir('test_ds', sm_config()['fs']['data_dir'])
#     work_dir.copy_input_data(input_remote_path, None)
#
#     file_list = set(listdir(ds_path))
#     assert file_list == {'foo.imzML', 'foo.ibd', 'config.json'}


def test_work_dir_copy_input_data_no_files_local_path(clear_files):
    create_sample_files(input_local_path)

    work_dir = WorkDir('test_ds', sm_config()['fs']['data_dir'])
    work_dir.copy_input_data(input_local_path, join(input_local_path, 'config.json'))

    file_list = set(listdir(ds_path))
    assert file_list == {'foo.imzML', 'foo.ibd', 'config.json'}


def test_work_dir_copy_input_data_files_exist(clear_files):
    create_sample_files(input_local_path)
    create_sample_files(ds_path)

    work_dir = WorkDir(ds_name, sm_config()['fs']['data_dir'])
    work_dir.copy_input_data(input_local_path, join(input_local_path, 'config.json'))

    file_list = set(listdir(ds_path))
    assert file_list == {'foo.imzML', 'foo.ibd', 'config.json'}
