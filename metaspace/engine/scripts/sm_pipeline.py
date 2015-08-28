__author__ = 'intsco'

import luigi
import luigi.s3
import luigi.contrib.spark
import luigi.contrib.ssh
import luigi.file

import sys
from os import environ
from os.path import join, dirname, realpath
from subprocess import call, Popen, check_call, PIPE
from datetime import datetime


class PipelineContext(object):
    s3_client = luigi.s3.S3Client()

    cluster_key_file = luigi.Parameter('/home/ubuntu/.ssh/sm_spark_cluster.pem')
    cluster_user = luigi.Parameter('root')
    # _spark_master_host = luigi.Parameter('')

    project_dir = '/home/ubuntu/sm'
    base_data_dir = luigi.Parameter('/home/ubuntu/sm/data')
    data_dir = luigi.Parameter('/')
    # master_base_data_dir = luigi.Parameter('/root/sm/data')
    master_data_dir = luigi.Parameter('/root/sm/data')
    s3_dir = luigi.Parameter()
    input_fn = luigi.Parameter()
    base_fn = luigi.Parameter('')
    scripts_dir = luigi.Parameter('')
    queries_fn = luigi.Parameter('queries.pkl')

    _annot_results_fn = None

    def imzml_fn(self):
        return self.base_fn + '.imzML'

    def ibd_fn(self):
        return self.base_fn + '.ibd'

    def txt_fn(self):
        return self.base_fn + '.txt'

    def coord_fn(self):
        return self.base_fn + '_coord.txt'

    def annotation_results_fn(self):
        if not PipelineContext._annot_results_fn:
            PipelineContext._annot_results_fn = '{}_results_{}.pkl'.format(
                self.base_fn, datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
        return PipelineContext._annot_results_fn

    def get_spark_master_host(self):
        with open('/home/ubuntu/sm/conf/SPARK_MASTER') as f:
            return f.readline().strip('\n')

    def context(self):
        return {'base_data_dir': self.base_data_dir,
                'data_dir': join(self.base_data_dir, self.input_fn.split('.')[0]),
                # 'master_base_data_dir': self.master_base_data_dir,
                'master_data_dir': self.master_data_dir,
                's3_dir': self.s3_dir,
                'input_fn': self.input_fn,
                'base_fn': self.input_fn.split('.')[0],
                'queries_fn': self.queries_fn,
                'scripts_dir': dirname(realpath(__file__))}


class GetInputData(PipelineContext, luigi.Task):

    def output(self):
        return (luigi.LocalTarget(join(self.data_dir, self.input_fn)),
                luigi.LocalTarget(join(self.data_dir, self.base_fn + '.imzML')),
                luigi.LocalTarget(join(self.data_dir, self.base_fn + '.ibd')))

    def run(self):
        print "Downloading from {} to {}".format(self.s3_dir, self.data_dir)
        path = join(self.s3_dir, self.input_fn)
        if self.s3_client.exists(path):
            with self.output()[0].open('w') as out:
                out.write(self.s3_client.get_key(path).read())
        else:
            print "File {} doesn't exists".fomat(path)

        print "Unzipping file {}".format(self.input_fn)
        call(['unzip', join(self.data_dir, self.input_fn), '-d', self.data_dir])


class ImzMLToTxt(PipelineContext, luigi.Task):

    def requires(self):
        return GetInputData(**self.context())

    def output(self):
        return luigi.s3.S3Target(join(self.s3_dir, self.txt_fn())),\
               luigi.s3.S3Target(join(self.s3_dir, self.coord_fn())),\
               luigi.LocalTarget(join(self.data_dir, self.coord_fn()))

    def run(self):
        print "Converting {} file".format(self.imzml_fn())
        call(['python', join(self.project_dir, 'scripts/imzml_to_txt.py'),
              join(self.data_dir, self.imzml_fn()),
              join(self.data_dir, self.txt_fn()),
              join(self.data_dir, self.coord_fn())])

        print "Uploading {}, {} converted data to {} path".format(
            join(self.data_dir, self.txt_fn()),
            join(self.data_dir, self.coord_fn()),
            self.s3_dir)
        for f in [self.txt_fn(), self.coord_fn()]:
            self.s3_client.put(join(self.data_dir, f), join(self.s3_dir, f))


class PrepareQueries(PipelineContext, luigi.Task):

    def output(self):
        return luigi.contrib.ssh.RemoteTarget(path=join(self.master_data_dir, self.queries_fn),
                                              host=self.get_spark_master_host(),
                                              username=self.cluster_user,
                                              key_file=self.cluster_key_file)

    def run(self):
        print "Exporting queries from DB to {} file".format(join(self.data_dir, self.queries_fn))
        call(['mkdir', '-p', self.data_dir])

        cmd = ['python', join(self.project_dir, 'scripts/run_save_queries.py'),
              '--out', join(self.data_dir, self.queries_fn),
              '--config', join(self.project_dir, 'conf/config.json')]
        check_call(cmd)

        print "Uploading queries file {} to {} spark master dir".format(self.queries_fn, self.master_data_dir)
        self.output().put(join(self.data_dir, self.queries_fn))


class SparkMoleculeAnnotation(PipelineContext, luigi.Task):
    spark_submit = luigi.Parameter('/root/spark/bin/spark-submit')
    app = luigi.Parameter('/root/sm/scripts/run_process_dataset.py')
    name = luigi.Parameter('SM Molecule Annotation')
    executor_memory = luigi.Parameter('6g')
    py_files = luigi.Parameter('/root/sm/engine.zip')

    master_data_dir = luigi.Parameter('/root/sm/data')
    queries_fn = luigi.Parameter('queries.pkl')
    rows = luigi.Parameter()
    cols = luigi.Parameter()

    def spark_command(self):
        return ['--master', 'spark://{}:7077'.format(self.get_spark_master_host()),
                '--executor-memory', self.executor_memory,
                '--py-files', self.py_files,
                '--verbose',
                self.app]

    def app_options(self):
        return ['--out', join(self.master_data_dir, self.annotation_results_fn()),
                '--ds', join(self.s3_dir.replace('s3:', 's3n:'), self.txt_fn()),
                '--queries', join(self.master_data_dir, self.queries_fn),
                '--rows', str(self.rows),
                '--cols', str(self.cols)]

    def requires(self):
        return PrepareQueries(**self.context()), \
               ImzMLToTxt(**self.context())

    def output(self):
        return luigi.LocalTarget(join(self.data_dir, self.annotation_results_fn()))

    def run(self):
        spark_master_remote_context = luigi.contrib.ssh.RemoteContext(host=self.get_spark_master_host(),
                                                                      username=self.cluster_user,
                                                                      key_file=self.cluster_key_file)
        cmd = [self.spark_submit] + self.spark_command() + self.app_options()
        popen = spark_master_remote_context.Popen(cmd)
        out, err = popen.communicate()

        master_data = luigi.contrib.ssh.RemoteTarget(path=join(self.master_data_dir, self.annotation_results_fn()),
                                                     host=self.get_spark_master_host(),
                                                     username=self.cluster_user,
                                                     key_file=self.cluster_key_file)
        master_data.get(join(self.data_dir, self.annotation_results_fn()))


class InsertAnnotationsToDB(PipelineContext, luigi.Task):
    rows = luigi.Parameter()
    cols = luigi.Parameter()

    def requires(self):
        return SparkMoleculeAnnotation(rows=self.rows, cols=self.cols,
                                       **self.context())

    def output(self):
        return luigi.LocalTarget(join(self.data_dir, 'AnnotationInsertStatus'))

    def run(self):
        cmd = ['python', '/home/ubuntu/sm/scripts/run_insert_to_db.py',
               '--ip', join(self.s3_dir, self.input_fn),
               '--rp', join(self.data_dir, self.annotation_results_fn()),
               '--cp', join(self.data_dir, self.coord_fn()),
               '--rows', self.rows,
               '--cols', self.cols,
               '--config', '/home/ubuntu/sm/conf/config.json',
               '--dsname', self.base_fn]
        try:
            check_call(cmd)
        except Exception as e:
            print e
        else:
            with self.output().open('w') as output:
                output.write('OK')


class RunPipeline(PipelineContext, luigi.WrapperTask):
    # don't try to access parameters from PipelineContext here
    rows = luigi.Parameter()
    cols = luigi.Parameter()

    def requires(self):
        yield InsertAnnotationsToDB(rows=str(self.rows), cols=str(self.cols), **self.context())


if __name__ == '__main__':
    # since we are setting MySecondTask to be the main task,
    # it will check for the requirements first, then run
    # cmd_args = ["--local-scheduler"]
    luigi.run(main_task_cls=RunPipeline)

# python sm_pipeline.py --logging-conf-file luigi_log.cfg --s3-dir s3://embl-intsco-sm-test
# --fn Example_Processed.zip --local-data-dir /home/ubuntu/sm/data/test1 --rows 3 --cols 3"