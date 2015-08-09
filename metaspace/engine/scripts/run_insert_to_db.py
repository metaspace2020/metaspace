"""
.. module:: run_insert_to_db
    :synopsis: Script for inserting processing results to database.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
.. moduleauthor:: Shefali Sharma <shefali.sharma@embl.de>
"""


def main():
    '''
	Inserts to datasets, coordinates, and jobs table. And then inserts pickled results of the :mod:`run_process_dataset` script to the database.
 	:param --ip: input file path
 	:param --rp: result file path
 	:param --cp: coordinate file path
 	:param --dsid: dataset id
 	:param --dsname: dataset name

 	:param --config: database config filename (used for the database connection)
 	:param --jobid: job id (defaults to max job_id in the database + 1)

 	:param --rows: number of rows
 	:param --cols: number of columns
	'''

    import numpy as np
    from os import curdir, sep, path
    import psycopg2, psycopg2.extras
    import json
    import argparse
    import cPickle

    import sys
    from os.path import dirname, realpath
    sys.path.append(dirname(dirname(realpath(__file__))))

    from engine import util

    adducts = ["H", "Na", "K"]

    parser = argparse.ArgumentParser(description='Insert pickled results to DB.')
    parser.add_argument('--ip', dest='ip', type=str, help='input file path', required=True)
    parser.add_argument('--rp', dest='rp', type=str, help='result file path', required=True)
    parser.add_argument('--cp', dest='cp', type=str, help='coordinate file path', required=True)

    parser.add_argument('--dsid', dest='dsid', type=int, help='dataset id')
    parser.add_argument('--dsname', dest='dsname', type=str, help='dataset name')

    parser.add_argument('--config', dest='config', type=str, help='database config filename')
    parser.add_argument('--jobid', dest='jobid', type=int, help='job id')

    parser.add_argument('--rows', dest='rows', type=int, help='number of rows')
    parser.add_argument('--cols', dest='cols', type=int, help='number of columns')

    parser.set_defaults(config='../config.json', rows=-1, cols=-1)
    args = parser.parse_args()

    print args.config
    print args.dsid

    with open(args.config) as f:
        config = json.load(f)

    config_db = config["db"]

    util.my_print("Connecting to DB...")

    conn = psycopg2.connect("dbname=%s user=%s password=%s host=%s" % (
    config_db['db'], config_db['user'], config_db['password'], config_db['host']))
    cur = conn.cursor()

    '''
	Insert into datasets table.
	datasets table columns: dataset_id, dataset(name), filename, nrows, ncols 
	If dataset id is not provided, use an auto increamented one. If user provides a dataset id that already exists, then, it will throw an error (dataset_id - primary key)
	'''
    util.my_print("Inserting to datasets ...")
    ds_id = args.dsid
    if ds_id == None:
        cur.execute("SELECT max(dataset_id) FROM datasets")
        try:
            ds_id = cur.fetchone()[0] + 1
        except:
            ds_id = 0
        util.my_print("No dataset id specified, using %d and inserting to datasets" % ds_id)
    cur.execute("INSERT INTO datasets VALUES (%s, %s, %s, %s, %s)", (ds_id, args.dsname, args.ip, args.rows, args.cols))

    '''
	Insert into coordinates table.
	coordinates table columns: dataset_id, index, x, y
	'''
    util.my_print("Inserting to coordinates ...")
    f = open(args.cp)
    cur.execute("ALTER TABLE ONLY coordinates ALTER COLUMN dataset_id SET DEFAULT %d" % ds_id)
    cur.copy_from(f, 'coordinates', sep=',', columns=('index', 'x', 'y'))

    '''
	Insert into jobs table
	jobs table columns:  id, type, formula_id, dataset_id, done, status, tasks_done, tasks_total, start, finish
	'''
    util.my_print("Inserting to jobs...")
    job_id = args.jobid
    if job_id == None:
        cur.execute("SELECT max(id) FROM jobs")
        try:
            job_id = cur.fetchone()[0] + 1
        except:
            job_id = 0
        util.my_print("No job id specified, using %d and inserting to jobs" % job_id)
        cur.execute(
            "INSERT INTO jobs VALUES (%d, 1, -1, %d, true, 'SUCCEEDED', 0, 0, '2000-01-01 00:00:00', '2000-01-01 00:00:00')" %
            (job_id, ds_id))

    '''
	Insert results into job_result_data, and job_result_stats
	'''

    util.my_print("Reading %s..." % args.rp)
    with open(args.rp) as f:
        r = cPickle.load(f)

    if sum(r["lengths"]) > 0:
        util.my_print("Inserting to job_result_data...")
        cur.execute("INSERT INTO job_result_data VALUES %s" %
                    ",".join(['(%d, %d, %d, %d, %d, %.6f)' % (job_id,
                                                              int(r["formulas"][i]),
                                                              int(r["mzadducts"][i]), j, k, v)
                              for i in xrange(len(r["res_dicts"])) for j in xrange(len(r["res_dicts"][i])) for k, v in
                              r["res_dicts"][i][j].iteritems()])
                    )

        util.my_print("Inserting to job_result_stats...")
        for stdict in r["stat_dicts"]:
            if "entropies" in stdict:
                stdict.update({'mean_ent': np.mean(stdict["entropies"])})

        cur.execute('INSERT INTO job_result_stats VALUES %s' % (
            ",".join(
                ['(%d, %s, %d, %d, \'%s\')' % (job_id, r["formulas"][i], r["mzadducts"][i], r["lengths"][i], json.dumps(
                    r["stat_dicts"][i]
                )) for i in xrange(len(r["formulas"]))])
        ))

    conn.commit()
    conn.close()

    util.my_print("All done!")


if __name__ == "__main__":
    main()
