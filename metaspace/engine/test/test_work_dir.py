from mock import patch, MagicMock
from os.path import join, realpath, dirname
from os import listdir
from fabric.api import local
from fabric.context_managers import lcd

from engine.search_job import WorkDir
from engine.test.util import ds_config


proj_dir_path = dirname(dirname(__file__))


def test_work_dir_copy_input_data(ds_config):
    input_path = join(proj_dir_path, 'data/test_input_path')
    ds_path = join(proj_dir_path, 'data/test_ds_path')
    try:
        local('mkdir -p {}'.format(input_path))
        with lcd(input_path):
            local(' echo "FOO!" > foo.imzML')
            local(' echo "FOO!" > foo.ibd')
            local(' echo "FOO!" > config.json')

        ds_config['name'] = 'test_ds_path'
        work_dir = WorkDir(ds_config)
        work_dir.copy_input_data(input_path)

        file_list = set(listdir(ds_path))
        assert file_list == {'foo.imzML', 'foo.ibd', 'config.json'}

    finally:
        local('rm -R {}'.format(input_path))
        local('rm -R {}'.format(ds_path))
