__author__ = 'intsco'

import luigi
import luigi.s3
import luigi.contrib.spark
import luigi.contrib.ssh

import sys
from os import environ
from os.path import join, dirname, realpath
from subprocess import call, Popen, check_call, PIPE


def get_spark_master_host():
    return open('../conf/SPARK_MASTER').readline().strip('\n')


class PipelineContext(object):
    s3_client = luigi.s3.S3Client(aws_access_key_id=environ['AWS_ACCESS_KEY_ID'],
                                  aws_secret_access_key=environ['AWS_SECRET_ACCESS_KEY'])
    spark_master_host = luigi.Parameter(get_spark_master_host())
    cluster_key_file = '/home/ubuntu/.ssh/sm_spark_cluster.pem'
    cluster_user = 'root'

    local_data_dir = luigi.Parameter()
    s3_dir = luigi.Parameter()
    fn = luigi.Parameter()

    def context(self):
        return {'spark_master_host': self.spark_master_host,
                'local_data_dir': self.local_data_dir,
                's3_dir': self.s3_dir,
                'fn': self.fn}


class GetInputData(PipelineContext, luigi.Task):
    imzml_fn = luigi.Parameter()
    ibd_fn = luigi.Parameter()

    def run(self):
        print "Downloading from {} to {}".format(self.s3_dir, self.local_data_dir)
        with self.output()[0].open('w') as out:
            path = join(self.s3_dir, self.fn)
            if self.s3_client.exists(path):
                out.write(self.s3_client.get_key().read())
            else:
                print "File {} doesn't exists".fomat(path)

        print "Unzipping file {}".format(self.fn)
        call(['unzip', join(self.local_data_dir, self.fn), '-d', self.local_data_dir])

    def output(self):
        return (luigi.LocalTarget(join(self.local_data_dir, self.fn)),
                luigi.LocalTarget(join(self.local_data_dir, self.imzml_fn)),
                luigi.LocalTarget(join(self.local_data_dir, self.ibd_fn)))


class ImzMLToTxt(PipelineContext, luigi.Task):
    txt_fn = luigi.Parameter()
    imzml_fn = luigi.Parameter()
    coord_fn = luigi.Parameter()

    def requires(self):
        ibd_fn = self.txt_fn.split('.')[0] + '.ibd'
        return GetInputData(imzml_fn=self.imzml_fn,
                            ibd_fn=ibd_fn,
                            **self.context())

    def output(self):
        return luigi.s3.S3Target(join(self.s3_dir, self.txt_fn)),\
               luigi.s3.S3Target(join(self.s3_dir, self.coord_fn)),\
               luigi.LocalTarget(join(self.local_data_dir, self.coord_fn))

    def run(self):
        print "Converting {} file".format(self.imzml_fn)
        call(['python', 'imzml_to_txt.py',
              join(self.local_data_dir, self.imzml_fn),
              join(self.local_data_dir, self.txt_fn),
              join(self.local_data_dir, self.coord_fn)])

        print "Uploading {}, {} converted data to {} path".format(
            join(self.local_data_dir, self.txt_fn),
            join(self.local_data_dir, self.coord_fn),
            self.s3_dir)
        for f in [self.txt_fn, self.coord_fn]:
            self.s3_client.put(join(self.local_data_dir, f), join(self.s3_dir, f))


class PrepareQueries(PipelineContext, luigi.Task):
    master_data_dir = luigi.Parameter('/root/sm/data')
    queries_fn = luigi.Parameter('queries.pkl')

    def output(self):
        return luigi.contrib.ssh.RemoteTarget(path=join(self.master_data_dir, self.queries_fn),
                                              host=self.spark_master_host,
                                              username=self.cluster_user,
                                              key_file=self.cluster_key_file)

    def run(self):
        print "Exporting queries from DB to {} file".format(join(self.local_data_dir, self.queries_fn))
        call(['mkdir', '-p', self.local_data_dir])

        cmd = ['python', 'run_save_queries.py',
              '--out', join(self.local_data_dir, self.queries_fn),
              '--config', '../conf/config.json']
        check_call(cmd)

        print "Uploading queries file {} to {} spark master dir".format(self.queries_fn, self.master_data_dir)
        self.output().put(join(self.local_data_dir, self.queries_fn))


class SparkMoleculeAnnotation(PipelineContext, luigi.Task):
    spark_submit = luigi.Parameter('/root/spark/bin/spark-submit')
    app = luigi.Parameter('/root/sm/scripts/run_process_dataset.py')
    name = luigi.Parameter('SM Molecule Annotation')
    # deploy_mode = luigi.Parameter('client')
    executor_memory = luigi.Parameter('6g')
    py_files = luigi.Parameter('/root/sm/engine.zip')

    annotation_results_fn = luigi.Parameter()
    txt_fn = luigi.Parameter()
    master_data_dir = luigi.Parameter('/root/sm/data')
    rows = luigi.Parameter()
    cols = luigi.Parameter()
    queries_fn = luigi.Parameter('queries.pkl')

    def spark_command(self):
        return ['--executor-memory', self.executor_memory,
                '--py-files', self.py_files,
                self.app]

    def app_options(self):
        return ['--out', join(self.master_data_dir, self.annotation_results_fn),
                '--ds', join(self.s3_dir.replace('s3:', 's3n:'), self.txt_fn),
                '--queries', join(self.master_data_dir, self.queries_fn),
                '--rows', str(self.rows),
                '--cols', str(self.cols)]

    def requires(self):
        base_fn = self.fn.split('.')[0]
        return PrepareQueries(master_data_dir=self.master_data_dir,
                              **self.context()), \
               ImzMLToTxt(txt_fn=base_fn + ".txt",
                          imzml_fn=base_fn + '.imzML',
                          coord_fn=base_fn + '_coord.txt',
                          **self.context())

    def output(self):
        return luigi.LocalTarget(join(self.local_data_dir, self.annotation_results_fn))

    def run(self):
        spark_master_context = luigi.contrib.ssh.RemoteContext(host=self.spark_master_host,
                                                               username=self.cluster_user,
                                                               key_file=self.cluster_key_file)
        cmd = [self.spark_submit] + self.spark_command() + self.app_options()
        popen = spark_master_context.Popen(cmd)
        out, err = popen.communicate()

        master_data = luigi.contrib.ssh.RemoteTarget(path=join(self.master_data_dir, self.annotation_results_fn),
                                                     host=self.spark_master_host,
                                                     username=self.cluster_user,
                                                     key_file=self.cluster_key_file)
        master_data.get(join(self.local_data_dir, self.annotation_results_fn))


class InsertAnnotationsToDB(PipelineContext, luigi.Task):
    annotation_fn = luigi.Parameter()
    txt_fn = luigi.Parameter()
    coord_fn = luigi.Parameter()
    rows = luigi.Parameter()
    cols = luigi.Parameter()

    def requires(self):
        return SparkMoleculeAnnotation(annotation_results_fn=self.annotation_fn,
                                       txt_fn=self.txt_fn,
                                       rows=self.rows, cols=self.cols,
                                       **self.context())

    def output(self):
        return luigi.LocalTarget(join(self.local_data_dir, 'AnnotationInsertStatus'))

    def run(self):
        cmd = ['python', 'run_insert_to_db.py',
               '--ip', join(self.s3_dir, self.fn),
               '--rp', join(self.local_data_dir, self.annotation_fn),
               '--cp', join(self.local_data_dir, self.coord_fn),
               '--rows', self.rows,
               '--cols', self.cols,
               '--config', '../conf/config.json']
        # popen = Popen(cmd)
        # out, err = popen.communicate()
        try:
            check_call(cmd)
        except Exception as e:
            print e.message
        else:
            with self.output().open('w') as output:
                output.write('OK')


class RunPipeline(PipelineContext, luigi.WrapperTask):
    rows = luigi.Parameter()
    cols = luigi.Parameter()

    def requires(self):
        base_fn = self.fn.split('.')[0]
        yield InsertAnnotationsToDB(annotation_fn=base_fn + '_result.pkl',
                                    txt_fn=base_fn + '.txt',
                                    coord_fn=base_fn + '_coord.txt',
                                    rows=self.rows, cols=self.cols,
                                    **self.context())


if __name__ == '__main__':
    # since we are setting MySecondTask to be the main task,
    # it will check for the requirements first, then run
    # cmd_args = ["--local-scheduler"]
    luigi.run(main_task_cls=RunPipeline)

# ssh -t sm-webserver "cd ~/sm/webserver/scripts; python sm_pipeline.py --logging-conf-file luigi_log.cfg --s3-dir s3://embl-intsco-sm-test --fn Example_Processed.zip --local-data-dir /home/ubuntu/sm/data/test1 --rows 3 --cols 3"