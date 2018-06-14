"""

:synopsis: Access to datasets stored in a local directory or on S3

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
from os.path import exists, join, split
from os import listdir
import re
from shutil import copytree, copy
from subprocess import CalledProcessError
import logging
import boto3
from botocore.exceptions import ClientError
from boto3.s3.transfer import S3Transfer

from sm.engine.util import cmd_check, SMConfig, split_s3_path

logger = logging.getLogger('engine')


def split_local_path(path):
    return path.split('file://')[-1]


def delete_s3_path(bucket, path, s3):
    try:
        bucket_obj = s3.Bucket(bucket)
        for obj in bucket_obj.objects.filter(Prefix=path):
            s3.Object(bucket, obj.key).delete()
        logger.info('Successfully deleted "%s"', path)
    except CalledProcessError as e:
        logger.warning('Deleting "%s" error: %s', path, e.stderr)


def delete_local_path(path):
    try:
        cmd_check('rm -rf {}', path)
        logger.info('Successfully deleted "%s"', path)
    except CalledProcessError as e:
        logger.warning('Deleting %s error: %s', path, e.stderr)


class LocalWorkDir(object):

    def __init__(self, base_path, ds_id):
        self.ds_path = join(base_path, ds_id)
        self._ms_file_path = None

    @property
    def ms_file_path(self):
        if self._ms_file_path:
            return self._ms_file_path

        file_handlers = SMConfig.get_conf()['ms_file_handlers']
        for handler in file_handlers:
            ms_file_extension = handler['extensions'][0]
            logger.info('"%s" file handler is looking for files with "%s" extension \
                        in the input directory',  handler['type'], ms_file_extension)
            ms_file_path = next((fn for fn in listdir(self.ds_path) \
                if re.search(r'\.{}$'.format(ms_file_extension), fn, re.IGNORECASE)), None)
            if ms_file_path:
                logger.info('"%s" file handler has found "%s" in the input directory',
                            handler['type'], ms_file_path)
                self._ms_file_path = join(self.ds_path, ms_file_path)
                break
        return self._ms_file_path if self._ms_file_path else ''

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
        delete_local_path(self.ds_path)

    def copy(self, source, dest, is_file=False):
        if is_file:
            folder, _ = split(dest)
            cmd_check('mkdir -p {}', folder)
            copy(source, dest)
        else:
            copytree(source, dest)


class S3WorkDir(object):

    def __init__(self, base_path, ds_id, s3, s3transfer):
        self.s3 = s3
        self.s3transfer = s3transfer
        self.bucket, path = split_s3_path(base_path)
        self.ds_path = join(path, ds_id)

    @property
    def txt_path(self):
        return join(self.bucket, self.ds_path, 'ds.txt')

    @property
    def coord_path(self):
        return join(self.bucket, self.ds_path, 'ds_coord.txt')

    def clean(self):
        delete_s3_path(self.bucket, self.ds_path, self.s3)

    def exists(self, path):
        try:
            self.s3.Object(*split_s3_path(path)).load()
        except ClientError as e:
            if e.response['Error']['Code'] == "404":
                return False
            else:
                raise e
        else:
            logger.info('Path s3://%s/%s already exists', self.bucket, path)
            return True

    def copy(self, local, remote):
        logger.info('Coping from {} to {}'.format(local, remote))
        self.s3transfer.upload_file(local, *split_s3_path(remote))


def local_path(path):
    return 'file://' + path


def s3_path(path):
    return 's3a://{}'.format(path)


class WorkDirManager(object):
    """ Provides access to the work directory of the target dataset

    Args
    ----
    ds_id : str
        Dataset unique id
    """
    def __init__(self, ds_id):
        self.sm_config = SMConfig.get_conf()

        if not self.sm_config['fs'].get('s3_base_path', None):
            self.local_fs_only = True
        elif not self.sm_config['fs']['s3_base_path']:
            self.local_fs_only = True
        else:
            self.local_fs_only = False

        cred_dict = dict(aws_access_key_id=self.sm_config['aws']['aws_access_key_id'],
                         aws_secret_access_key=self.sm_config['aws']['aws_secret_access_key'])
        session = boto3.session.Session(**cred_dict)
        self.s3 = session.resource('s3')
        self.s3transfer = S3Transfer(boto3.client('s3', 'eu-west-1', **cred_dict))

        self.local_dir = LocalWorkDir(self.sm_config['fs']['base_path'], ds_id)
        if not self.local_fs_only:
            self.remote_dir = S3WorkDir(self.sm_config['fs']['s3_base_path'], ds_id, self.s3, self.s3transfer)

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

    def copy_input_data(self, input_data_path):
        """ Copy mass spec files from input path to a dataset work directory

        Args
        ----
        input_data_path : str
            Path to input files
        """
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

    def del_input_data(self, input_data_path):
        if input_data_path.startswith('s3a://'):
            bucket, path = split_s3_path(input_data_path)
            delete_s3_path(bucket, path, self.s3)
        else:
            delete_local_path(input_data_path)

    def clean(self):
        self.local_dir.clean()
        if not self.local_fs_only:
            self.remote_dir.clean()

    def upload_to_remote(self):
        self.remote_dir.copy(self.local_dir.coord_path, self.remote_dir.coord_path)
        self.remote_dir.copy(self.local_dir.txt_path, self.remote_dir.txt_path)

    def exists(self, path):
        if self.local_fs_only:
            return self.local_dir.exists(path)
        else:
            return self.remote_dir.exists(path)
