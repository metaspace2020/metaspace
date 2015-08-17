__author__ = 'intsco'

from os.path import join
import psycopg2
import json
import cPickle
from luigi import interface, scheduler, worker
from os import environ
from scripts.sm_pipeline import RunPipeline
from fabric.api import env
from fabric.api import put, local


class BlackboxPipelineTest:
    def __init__(self, project_dir):
        self._project_dir = project_dir
        self._test_dataset_dir = 's3://embl-sm-testing'
        self._input_fn = '20150730_ANB_spheroid_control_65x65_15um.zip'
        self._test_data_dir = join(project_dir, 'data/testing')
        self._master_data_dir = '/root/sm/data'
        self._rows = 65
        self._cols = 65
        self._config_path = join(project_dir, 'webserver/conf/config.json')
        self._sf_fn = 'result_sfs.txt'
        self._queries_fn = 'queries.pkl'
        self._test_queries_fn = 'test_queries.pkl'
        self._sf_set = set()
        self._sf_id_set = set()

    def _load_sf(self):
        with open(join(self._test_data_dir, self._sf_fn)) as f:
            self._sf_set = set(f.read().split('\n'))

    def _get_db_config(self):
        with open(self._config_path) as f:
            config = json.load(f)['db']
        return config

    def _collect_sf_ids(self):
        conn = psycopg2.connect(**self._get_db_config())
        sql = 'select distinct p.sf_id, sf from mz_peaks p join formulas f on p.sf_id=f.sf_id'
        cur = conn.cursor()
        cur.execute(sql)
        self._sf_id_set = set(sf_id for sf_id, sf in cur.fetchall() if sf in self._sf_set)

    def setup(self):
        self._load_sf()
        self._collect_sf_ids()

        print "Preparing test queries file..."

        local('python {}/webserver/scripts/run_save_queries.py --out {} --config {}'.
              format(self._project_dir, join(self._test_data_dir, self._queries_fn), self._config_path))

        queries = {}
        with open(join(self._test_data_dir, self._queries_fn)) as f:
            queries = cPickle.load(f)

        test_queries_inds = set(i for (i, sf_id) in enumerate(queries['ids']) if sf_id in self._sf_id_set)
        if len(test_queries_inds) == 0:
            raise Exception("Empty test queries!")
        test_queries = {}
        for name, coll in queries.iteritems():
            test_queries[name] = [x for (i, x) in enumerate(queries[name]) if i in test_queries_inds]

        with open(join(self._test_data_dir, self._test_queries_fn), 'wb') as f:
            cPickle.dump(test_queries, f)

        with open(join(self._project_dir, 'webserver/conf/SPARK_MASTER')) as f:
            env.host_string = 'root@' + f.readline().strip('\n')
            env.key_filename = '~/.ssh/sm_spark_cluster.pem'
        put(local_path=join(self._test_data_dir, self._test_queries_fn),
            remote_path=join(self._master_data_dir, self._test_queries_fn))

    def _run_pipeline(self):
        pipeline = RunPipeline(rows=self._rows, cols=self._cols,
                               s3_dir=self._test_dataset_dir, input_fn=self._input_fn, queries_fn=self._test_queries_fn)
        interface.setup_interface_logging(conf_file=join(self._project_dir, 'webserver/conf/luigi_log.cfg'))
        sch = scheduler.CentralPlannerScheduler()
        w = worker.Worker(scheduler=sch)
        w.add(pipeline)
        w.run()

    def test(self):
        print "Starting test pipeline..."
        self._run_pipeline()


if __name__ == '__main__':
    test = BlackboxPipelineTest('/home/ubuntu/sm')
    # test = BlackboxPipelineTest('/home/intsco/embl/SpatialMetabolomics')
    test.setup()
    test.test()
