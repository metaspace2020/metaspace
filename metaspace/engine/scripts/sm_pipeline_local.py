__author__ = 'intsco'

import json
import luigi
import luigi.file
from os.path import join, dirname, realpath
from subprocess import call, Popen, check_call, PIPE
from datetime import datetime


class PipelineContext(object):
    # major obligatory parameters, should be provided as pipeline start args
    project_dir = luigi.Parameter()
    data_dir = luigi.Parameter()

    # parameters computed on the basis of the major ones
    ds_config_fn = luigi.Parameter('config.json')
    # ds_config = luigi.Parameter('')
    input_fn = luigi.Parameter('')
    db_id = luigi.Parameter('')
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
        # if not PipelineContext._annot_results_fn:
        #     PipelineContext._annot_results_fn = 'results_{}.pkl'.format(
        #         datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
        # return PipelineContext._annot_results_fn
        return 'results.pkl'

    @staticmethod
    def run_cmd_write_status(cmd, status_path):
        try:
            check_call(cmd)
        except Exception as e:
            print e
        else:
            with open(status_path, 'w') as output:
                output.write('OK')

    def context(self):
        with open(join(self.data_dir, self.ds_config_fn)) as f:
            ds_config = json.load(f)

        return {'project_dir': self.project_dir,
                'data_dir': self.data_dir,
                'db_id': ds_config['inputs']['database'],
                'input_fn': ds_config['inputs']['data_file'],
                'base_fn': ds_config['inputs']['data_file'].split('.')[0],
                'queries_fn': self.queries_fn,
                'ds_config_fn': self.ds_config_fn}


class ImzMLToTxt(PipelineContext, luigi.Task):

    def output(self):
        return luigi.LocalTarget(join(self.data_dir, self.txt_fn)), \
               luigi.LocalTarget(join(self.data_dir, self.coord_fn))

    def run(self):
        print "Converting {} file".format(self.imzml_fn)
        check_call(['python', join(self.project_dir, 'scripts/imzml_to_txt.py'),
                    '--imzml', join(self.data_dir, self.imzml_fn),
                    '--data', join(self.data_dir, self.txt_fn),
                    '--coord', join(self.data_dir, self.coord_fn),
                    '--config', join(self.project_dir, 'conf/config.json'),
                    '--ds-config', join(self.data_dir, self.ds_config_fn)])


class PreparePeaksMZTable(PipelineContext, luigi.Task):
    def output(self):
        return luigi.LocalTarget(path=join(self.data_dir, 'peaks_mz_insert_status'))

    def run(self):
        cmd = ['python', join(self.project_dir, 'scripts/produce_theor_peaks_spark.py'),
               '--config', join(self.project_dir, 'conf/config.json'),
               '--ds-config', join(self.data_dir, self.ds_config_fn),
               '--theor-peaks-path', join(self.data_dir, 'theor_peaks.csv')]

        self.run_cmd_write_status(cmd, self.output().path)


class PrepareQueries(PipelineContext, luigi.Task):
    def requires(self):
        return PreparePeaksMZTable(**self.context())

    def output(self):
        return luigi.LocalTarget(path=join(self.data_dir, self.queries_fn))

    def run(self):
        print "Exporting queries from DB to {} file".format(join(self.data_dir, self.queries_fn))
        # call(['mkdir', '-p', self.data_dir])

        cmd = ['python', join(self.project_dir, 'scripts/run_save_queries.py'),
               '--config', join(self.project_dir, 'conf/config.json'),
               '--ds-config', join(self.data_dir, 'config.json'),
               '--out', self.output().path]
        check_call(cmd)


class SparkMoleculeAnnotation(PipelineContext, luigi.Task):

    def run_command(self):
        return ['python', join(self.project_dir, 'scripts/run_process_dataset.py'),
                '--ds-config', join(self.data_dir, 'config.json'),
                '--out', join(self.data_dir, self.annotation_results_fn),
                '--ds', join(self.data_dir, self.txt_fn),
                '--coord', join(self.data_dir, self.coord_fn),
                '--queries', join(self.data_dir, self.queries_fn)]

    def requires(self):
        return PrepareQueries(**self.context()), \
               ImzMLToTxt(**self.context())

    def output(self):
        return luigi.LocalTarget(join(self.data_dir, self.annotation_results_fn))

    def run(self):
        print self.run_command()
        check_call(self.run_command())


class InsertAnnotationsToDB(PipelineContext, luigi.Task):

    def requires(self):
        return SparkMoleculeAnnotation(**self.context())

    def output(self):
        return luigi.LocalTarget(join(self.data_dir, 'annotation_insert_status'))

    def run(self):
        cmd = ['python', join(self.project_dir, 'scripts/run_insert_to_db.py'),
               '--ip', join(self.data_dir, self.input_fn),
               '--rp', join(self.data_dir, self.annotation_results_fn),
               '--cp', join(self.data_dir, self.coord_fn),
               '--config', join(self.project_dir, 'conf/config.json'),
               '--ds-config', join(self.data_dir, 'config.json')]

        self.run_cmd_write_status(cmd, self.output().path)


class RunPipeline(PipelineContext, luigi.WrapperTask):
    # don't try to access parameters from PipelineContext here

    def requires(self):
        yield InsertAnnotationsToDB(**self.context())


if __name__ == '__main__':
    import time
    start = time.time()

    luigi.run(main_task_cls=RunPipeline)

    time_spent = time.time() - start
    print 'Pipeline running time: %d mins %d secs' % (int(round(time_spent/60)), int(round(time_spent%60)))
