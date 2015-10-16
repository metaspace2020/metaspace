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
    import psycopg2, psycopg2.extras
    import json
    import argparse
    import cPickle
    from datetime import datetime

    import sys
    from os.path import dirname, realpath
    sys.path.append(dirname(dirname(realpath(__file__))))

    from engine import util

    parser = argparse.ArgumentParser(description='Insert pickled results to the DB.')
    parser.add_argument('--ip', dest='ip', type=str, help='input file path', required=True)
    parser.add_argument('--rp', dest='rp', type=str, help='result file path', required=True)
    parser.add_argument('--cp', dest='cp', type=str, help='coordinate file path', required=True)
    parser.add_argument('--config', dest='config', type=str, help='SM config path')
    parser.add_argument('--ds-config', dest='ds_config', type=str, help='dataset config path')

    args = parser.parse_args()

    with open(args.config) as f:
        config = json.load(f)
    config_db = config['db']

    with open(args.ds_config) as f:
        ds_config = json.load(f)
    ds_name = ds_config['name']
    db_id = ds_config['inputs']['database_id']
    # nrows = ds_config['inputs']['max_y']
    # ncols = ds_config['inputs']['max_x']

    util.my_print("Connecting to DB...")

    conn = psycopg2.connect("dbname=%s user=%s password=%s host=%s" % (
    config_db['database'], config_db['user'], config_db['password'], config_db['host']))
    cur = conn.cursor()

    util.my_print("Using %s dataset" % ds_name)

    sql = "select id, ncols, nrows from dataset where name = '%s'" % ds_name
    try:
        cur.execute(sql)
        ds_id, nrows, ncols = cur.fetchone()

    except Exception as e:
        print e.message
        raise Exception('No dataset with name = %s!' % ds_name)

    '''
	Insert into jobs table
	jobs table columns:  id, type, formula_id, dataset_id, done, status, tasks_done, tasks_total, start, finish
	'''
    util.my_print("Inserting to jobs...")
    cur.execute("SELECT max(id) FROM job")
    try:
        job_id = cur.fetchone()[0] + 1
    except:
        job_id = 0
    util.my_print("No job id specified, using %d and inserting to jobs" % job_id)
    sql = "INSERT INTO job VALUES (%s, %s, %s, 'SUCCEEDED', 0, 0, '2000-01-01 00:00:00', %s)"
    cur.execute(sql, (job_id, db_id, ds_id, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))

    '''
	Insert results into job_result_data, and job_result_stat
	'''

    util.my_print("Reading %s..." % args.rp)
    with open(args.rp) as f:
        res = cPickle.load(f)

    util.my_print("Inserting to job_result_data...")

    rows = []
    for i, img_list in enumerate(res["res_dicts"]):
        for peak_i, img_sparse in enumerate(img_list):
            img_ints = np.zeros(int(nrows)*int(ncols)) if img_sparse is None else img_sparse.toarray().flatten()
            r = (job_id, db_id, res["formulas"][i], res["mzadducts"][i], peak_i,
                 img_ints.tolist(), img_ints.min(), img_ints.max())
            rows.append(r)
    cur.executemany("INSERT INTO job_result_data VALUES (%s, %s, %s, %s, %s, %s, %s, %s)", rows)

    util.my_print("Inserting to job_result_stat...")
    rows = []
    for i, sf_id in enumerate(res["formulas"]):
        r = (job_id, db_id, sf_id, res["mzadducts"][i], len(res['res_dicts'][i]), json.dumps(res["stat_dicts"][i]))
        rows.append(r)
    cur.executemany('INSERT INTO job_result_stat VALUES (%s, %s, %s, %s, %s, %s)', rows)

    conn.commit()
    conn.close()

    util.my_print("All done!")


if __name__ == "__main__":
    main()
