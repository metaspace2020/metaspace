"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import glob
from os.path import exists, join, split
from shutil import copytree, copy
from subprocess import CalledProcessError

import boto3
import botocore
from boto3.s3.transfer import S3Transfer

from sm.engine.util import local_path, cmd_check, SMConfig, logger, s3_path


def split_s3_path(path):
    return path.split('s3a://')[-1].split('/', 1)


def split_local_path(path):
    return path.split('file://')[-1]


class LocalWorkDir(object):

    def __init__(self, base_path, ds_name):
        self.ds_path = join(base_path, ds_name.replace('//', '/'))

    @property
    def ds_config_path(self):
        return join(self.ds_path, 'config.json')

    @property
    def imzml_path(self):
        path = glob.glob(join(self.ds_path, '*.imzML'))
        return path[0] if path else ''

    @property
    def txt_path(self):
        return join(self.ds_path, 'ds.txt')

    @property
    def coord_path(self):
        return join(self.ds_path, 'ds_coord.txt')

    def exists(self, path):
        if exists(split_local_path(path)):
            logger.info('Path %s already exists', path)
            return True
        else:
            return False

    def clean(self):
        try:
            cmd_check('rm -rf {}', self.ds_path)
            # cmd_check("find {} -type f ! -name '*.json' -delete", self.ds_path)
        except CalledProcessError as e:
            logger.warning('Deleting interim local data files error: %s', e.message)

    def copy(self, source, dest, is_file=False):
        if is_file:
            folder, _ = split(dest)
            cmd_check('mkdir -p {}', folder)
            copy(source, dest)
        else:
            copytree(source, dest)


class S3WorkDir(object):

    def __init__(self, base_path, ds_name, s3, s3transfer):
        self.s3 = s3
        self.s3transfer = s3transfer
        self.bucket, path = split_s3_path(base_path)
        self.ds_path = join(path, ds_name.replace('//', '/'))

    @property
    def ds_config_path(self):
        return join(self.bucket, self.ds_path, 'config.json')

    @property
    def txt_path(self):
        return join(self.bucket, self.ds_path, 'ds.txt')

    @property
    def coord_path(self):
        return join(self.bucket, self.ds_path, 'ds_coord.txt')

    def clean(self):
        try:
            bucket_obj = self.s3.Bucket(self.bucket)
            for obj in bucket_obj.objects.filter(Prefix=self.ds_path):
                self.s3.Object(self.bucket, obj.key).delete()
            logger.info('Successfully deleted interim data')
        except CalledProcessError as e:
            logger.warning('Deleting interim data files error: %s', e.message)

    def exists(self, path):
        try:
            self.s3.Object(*split_s3_path(path)).load()
        except botocore.exceptions.ClientError as e:
            if e.response['Error']['Code'] == "404":
                return False
            else:
                raise e
        else:
            logger.info('Path s3://%s/%s already exists', self.bucket, path)
            return True

    def copy(self, local, remote):
        logger.info('Coping DS text files to S3...')
        self.s3transfer.upload_file(local, *split_s3_path(remote))


class WorkDirManager(object):
    """ Provides an access to a work directory for a processed dataset

    Args
    ----
    ds_name : str
        Dataset name (alias)
    data_dir_path : str
        Dataset config
    """
    def __init__(self, ds_name):
        self.sm_config = SMConfig.get_conf()

        if 's3_base_path' not in self.sm_config['fs']:
            self.local_fs_only = True
        elif not self.sm_config['fs']['s3_base_path']:
            self.local_fs_only = True
        else:
            self.local_fs_only = False

        self.s3 = boto3.session.Session().resource('s3')
        self.s3transfer = S3Transfer(boto3.client('s3', 'eu-west-1'))

        self.local_dir = LocalWorkDir(self.sm_config['fs']['base_path'], ds_name)
        if not self.local_fs_only:
            self.remote_dir = S3WorkDir(self.sm_config['fs']['s3_base_path'], ds_name, self.s3, self.s3transfer)

    @property
    def ds_config_path(self):
        return self.local_dir.ds_config_path
        # if self.local_fs_only:
        #     return self.local_dir.ds_config_path
        # else:
        #     return self.remote_dir.ds_config_path

    @property
    def txt_path(self):
        if self.local_fs_only:
            return self._spark_path(self.local_dir.txt_path)
        else:
            return self._spark_path(self.remote_dir.txt_path)

    @property
    def coord_path(self):
        if self.local_fs_only:
            return self._spark_path(self.local_dir.coord_path)
        else:
            return self._spark_path(self.remote_dir.coord_path)

    def _spark_path(self, path):
        if self.local_fs_only:
            return local_path(path)
        else:
            return s3_path(path)

    def copy_input_data(self, input_data_path, ds_config_path):
        """ Copy imzML/ibd/config files from input path to a dataset work directory

        Args
        ----
        input_data_path : str
            Path to input files
        """
        # if self.local_fs_only:
        #     ex = self.local_dir.exists(self.local_dir.txt_path)
        # else:
        #     ex = self.remote_dir.exists(self.remote_dir.txt_path)
        if not self.local_dir.exists(self.local_dir.imzml_path):
            logger.info('Copying data from %s to %s', input_data_path, self.local_dir.ds_path)

            if input_data_path.startswith('s3a://'):
                cmd_check('mkdir -p {}', self.local_dir.ds_path)
                bucket_name, inp_path = split_s3_path(input_data_path)

                bucket = self.s3.Bucket(bucket_name)
                for obj in bucket.objects.filter(Prefix=inp_path):
                    if not obj.key.endswith('/'):
                        path = join(self.local_dir.ds_path, obj.key.split('/')[-1])
                        self.s3transfer.download_file(bucket_name, obj.key, path)
            else:
                self.local_dir.copy(input_data_path, self.local_dir.ds_path)

        if ds_config_path:
            self.local_dir.copy(ds_config_path, self.local_dir.ds_config_path, is_file=True)

    def clean(self):
        self.local_dir.clean()
        if not self.local_fs_only:
            self.remote_dir.clean()

    def upload_to_remote(self):
        self.remote_dir.copy(self.local_dir.coord_path, self.remote_dir.coord_path)
        self.remote_dir.copy(self.local_dir.txt_path, self.remote_dir.txt_path)
        # self.remote_dir.copy(self.local_dir.ds_config_path, self.remote_dir.ds_config_path)

        self.local_dir.clean()

    def exists(self, path):
        if self.local_fs_only:
            return self.local_dir.exists(path)
        else:
            return self.remote_dir.exists(path)

    # def upload_data_to_hdfs(self):
    #     """ If non local file system is used uploads plain text data files to it """
    #     logger.info('Coping DS text file to HDFS...')
    #     return_code = cmd(hdfs_prefix() + '-tests -e {}', hdfs_path(self.path))
    #     if return_code:
    #         cmd_check(hdfs_prefix() + '-mkdir -p {}', hdfs_path(self.path))
    #         cmd_check(hdfs_prefix() + '-copyFromLocal {} {}',
    #                   local_path(self.txt_path), hdfs_path(self.txt_path))
    #         cmd_check(hdfs_prefix() + '-copyFromLocal {} {}',
    #                   local_path(self.coord_path), hdfs_path(self.coord_path))
