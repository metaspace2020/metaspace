"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
from shutil import copytree
from os.path import exists, splitext, join
import tempfile
import json
import glob

from engine.util import local_path, hdfs_path, proj_root, hdfs_prefix, cmd_check, cmd, SMConfig


class WorkDir(object):

    def __init__(self, ds_name, data_dir_path=None):
        self.ds_name = ds_name
        self.data_dir_path = data_dir_path
        self.path = join(self.data_dir_path, ds_name)
        self.ds_config = None

    def copy_input_data(self, input_data_path):
        if not exists(self.path):
            print 'Copying {} to {}'.format(input_data_path, self.path)

            if input_data_path.startswith('http'):
                tmp_path = join(self.data_dir_path, 'tmp')
                cmd_check('mkdir -p {}', tmp_path)

                tmp_zip = tempfile.mkstemp(dir=tmp_path, suffix='.zip')[1]
                cmd_check('wget {} -O {}', input_data_path, tmp_zip)
                cmd_check('mkdir -p {}', self.path)
                cmd_check('unzip {} -d {}', tmp_zip, self.path)
            else:
                copytree(input_data_path, self.path)
        else:
            print 'Path {} already exists'.format(self.path)

    @property
    def ds_config_path(self):
        return join(self.path, 'config.json')

    @property
    def imzml_path(self):
        return glob.glob(join(self.path, '*.imzML'))[0]

    @property
    def txt_path(self):
        return join(self.path, 'ds.txt')

    @property
    def coord_path(self):
        return join(self.path, 'ds_coord.txt')
