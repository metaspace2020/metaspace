"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
from shutil import copytree, rmtree, copy
from os.path import exists, splitext, join
import tempfile
import json
import boto3
import glob
from subprocess import CalledProcessError

from engine.util import local_path, hdfs_path, proj_root, hdfs_prefix, cmd_check, cmd, SMConfig, logger


class WorkDir(object):
    """ Provides an access to a work directory for a processed dataset

    Args
    ----
    ds_name : str
        Dataset name (alias)
    data_dir_path : str
        Dataset config
    """
    def __init__(self, ds_name, data_dir_path=None):
        self.sm_config = SMConfig.get_conf()
        self.ds_name = ds_name
        self.data_dir_path = data_dir_path
        self.path = join(self.data_dir_path, ds_name)
        self.boto_session = boto3.Session()

    # TODO: add tests
    def drop_local_work_dir(self):
        try:
            cmd_check('rm -rf {}', self.path)
        except CalledProcessError as e:
            logger.warning('Deleting interim local data files error: {}', e.message)

    def clean_work_dirs(self):
        try:
            cmd_check('rm -rf {}', self.path)
            if not self.sm_config['fs']['local']:
                cmd_check(hdfs_prefix() + '-rm -R {}', hdfs_path(self.path))
        except CalledProcessError as e:
            logger.warning('Deleting interim data files error: {}', e.message)

    @staticmethod
    def split_s3_path(path):
        return path.split('s3://')[1].split('/', 1)

    def copy_input_data(self, input_data_path, ds_config_path):
        """ Copy imzML/ibd/config files from input path to a dataset work directory

        Args
        ----
        input_data_path : str
            Path to input files
        """
        if exists(self.path):
            logger.info('Path %s already exists', self.path)
        else:
            logger.info('Copying data from %s to %s', input_data_path, self.path)

            if input_data_path.startswith('s3://'):
                cmd_check('mkdir -p {}', self.path)
                bucket_name, inp_path = self.split_s3_path(input_data_path)

                s3 = self.boto_session.resource('s3')
                bucket = s3.Bucket(bucket_name)
                for obj in bucket.objects.filter(Prefix=inp_path):
                    if not obj.key.endswith('/'):
                        path = join(self.path, obj.key.replace('/', '_'))
                        with open(path, 'w') as f:
                            f.write(obj.get()['Body'].read())
            else:
                copytree(input_data_path, self.path)

        copy(ds_config_path, join(self.path, 'config.json'))

    def upload_data_to_hdfs(self):
        """ If non local file system is used uploads plain text data files to it """
        logger.info('Coping DS text file to HDFS...')
        return_code = cmd(hdfs_prefix() + '-test -e {}', hdfs_path(self.path))
        if return_code:
            cmd_check(hdfs_prefix() + '-mkdir -p {}', hdfs_path(self.path))
            cmd_check(hdfs_prefix() + '-copyFromLocal {} {}',
                      local_path(self.txt_path), hdfs_path(self.txt_path))
            cmd_check(hdfs_prefix() + '-copyFromLocal {} {}',
                      local_path(self.coord_path), hdfs_path(self.coord_path))

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
