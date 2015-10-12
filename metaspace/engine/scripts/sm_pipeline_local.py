__author__ = 'intsco'

import luigi
# import luigi.s3
# import luigi.contrib.spark
# import luigi.contrib.ssh
import luigi.file

import sys
from os import environ
from os.path import join, dirname, realpath
from subprocess import call, Popen, check_call, PIPE
from datetime import datetime


class PipelineContext(object):
    # major obligatory parameters, should be provided as pipeline start args
    project_dir = luigi.Parameter()
    input_fn = luigi.Parameter()
    db_id = luigi.Parameter()

    # parameters computed on the basis of the major ones
    # base_data_dir = luigi.Parameter('')
    data_dir = luigi.Parameter('')
    base_fn = luigi.Parameter('')
    queries_fn = luigi.Parameter('queries.pkl')

    _annot_results_fn = None

    @property
    def imzml_fn(self):
        return self.base_fn + '.imzML'

    @property
    def ibd_fn(self):
        return self.base_fn + '.ibd'

    @property
    def txt_fn(self):
        return 'ds.txt'

    @property
    def coord_fn(self):
        return 'ds_coord.txt'

    @property
    def annotation_results_fn(self):
        if not PipelineContext._annot_results_fn:
            PipelineContext._annot_results_fn = 'results_{}.pkl'.format(
                datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
        return PipelineContext._annot_results_fn

    def context(self):
        base_fn = self.input_fn.split('.')[0]
        return {'project_dir': self.project_dir,
                'data_dir': join(self.project_dir, 'data', base_fn),
                'db_id': self.db_id,
                'input_fn': self.input_fn,
                'base_fn': base_fn,
                'queries_fn': self.queries_fn}


class ImzMLToTxt(PipelineContext, luigi.Task):

    def output(self):
        return luigi.LocalTarget(join(self.data_dir, self.txt_fn)),\
               luigi.LocalTarget(join(self.data_dir, self.coord_fn))

    def run(self):
        print "Converting {} file".format(self.imzml_fn())
        call(['python', join(self.project_dir, 'scripts/imzml_to_txt.py'),
              join(self.data_dir, self.imzml_fn()),
              join(self.data_dir, self.txt_fn),
              join(self.data_dir, self.coord_fn)])

        # print "Uploading {}, {} converted data to {} path".format(
        #     join(self.data_dir, self.txt_fn()),
        #     join(self.data_dir, self.coord_fn()))
        # for f in [self.txt_fn(), self.coord_fn()]:
        #     self.s3_client.put(join(self.data_dir, f), join(self.s3_dir, f))


class PrepareQueries(PipelineContext, luigi.Task):

    def output(self):
        return luigi.LocalTarget(path=join(self.data_dir, self.queries_fn))

    def run(self):
        print "Exporting queries from DB to {} file".format(join(self.data_dir, self.queries_fn))
        # call(['mkdir', '-p', self.data_dir])

        cmd = ['python', join(self.project_dir, 'scripts/run_save_queries.py'),
               '--db-id', str(self.db_id),
               '--config', join(self.project_dir, 'conf/config.json'),
               '--out', self.output().path]
        check_call(cmd)

        # print "Uploading queries file {} to {} spark master dir".format(self.queries_fn, self.master_data_dir)
        # self.output().put(join(self.data_dir, self.queries_fn))


class SparkMoleculeAnnotation(PipelineContext, luigi.Task):
    # spark_submit = luigi.Parameter('/root/spark/bin/spark-submit')
    # app = luigi.Parameter('/root/sm/scripts/run_process_dataset.py')
    # name = luigi.Parameter('SM Molecule Annotation')
    # executor_memory = luigi.Parameter('6g')
    # py_files = luigi.Parameter('/root/sm/engine.zip')

    # master_data_dir = luigi.Parameter('/root/sm/data')
    # queries_fn = luigi.Parameter('queries.pkl')
    rows = luigi.Parameter()
    cols = luigi.Parameter()

    # def spark_command(self):
    #     return ['--master', 'spark://{}:7077'.format(self.get_spark_master_host()),
    #             '--executor-memory', self.executor_memory,
    #             '--py-files', self.py_files,
    #             '--verbose',
    #             self.app]

    def run_command(self):
        return ['python', join(self.project_dir, 'scripts/run_process_dataset.py'),
                '--out', join(self.data_dir, self.annotation_results_fn),
                '--ds', join(self.data_dir, self.txt_fn),
                '--coord', join(self.data_dir, self.coord_fn),
                '--queries', join(self.data_dir, self.queries_fn),
                '--rows', str(self.rows),
                '--cols', str(self.cols)]

    def requires(self):
        return PrepareQueries(**self.context()), \
               ImzMLToTxt(**self.context())

    def output(self):
        return luigi.LocalTarget(join(self.data_dir, self.annotation_results_fn))

    def run(self):
        # spark_master_remote_context = luigi.contrib.ssh.RemoteContext(host=self.get_spark_master_host(),
        #                                                               username=self.cluster_user,
        #                                                               key_file=self.cluster_key_file)
        # cmd = [self.spark_submit] + self.spark_command() + self.run_command()
        # popen = spark_master_remote_context.Popen(cmd)
        # out, err = popen.communicate()
        #
        # master_data = luigi.contrib.ssh.RemoteTarget(path=join(self.master_data_dir, self.annotation_results_fn()),
        #                                              host=self.get_spark_master_host(),
        #                                              username=self.cluster_user,
        #                                              key_file=self.cluster_key_file)
        # master_data.get(join(self.data_dir, self.annotation_results_fn()))
        print self.run_command()
        check_call(self.run_command())


class InsertAnnotationsToDB(PipelineContext, luigi.Task):
    rows = luigi.Parameter()
    cols = luigi.Parameter()

    def requires(self):
        return SparkMoleculeAnnotation(rows=self.rows, cols=self.cols,
                                       **self.context())

    def output(self):
        return luigi.LocalTarget(join(self.data_dir, 'AnnotationInsertStatus'))

    def run(self):
        cmd = ['python', join(self.project_dir, 'scripts/run_insert_to_db.py'),
               '--ip', join(self.data_dir, self.input_fn),
               '--rp', join(self.data_dir, self.annotation_results_fn),
               '--cp', join(self.data_dir, self.coord_fn),
               '--rows', self.rows,
               '--cols', self.cols,
               '--config', join(self.project_dir, 'conf/config.json'),
               '--dsname', self.base_fn]
        try:
            check_call(cmd)
        except Exception as e:
            print e
        # else:
        #     with self.output().open('w') as output:
        #         output.write('OK')


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