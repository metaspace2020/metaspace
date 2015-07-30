"""
.. module:: run_insert_to_db
    :synopsis: Script for inserting processing results to database.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""


def main():
	'''Inserts pickled results of the :mod:`run_process_dataset` script to the database.

	:param --in: input filename
	:param --config: config filename (used for the database connection)
	:param --jobid: job id (defaults to max job_id in the database + 1)
	:param --dsid: dataset id
	'''

	import numpy as np
	from os import curdir,sep,path
	import psycopg2,psycopg2.extras
	import json
	import argparse
	import cPickle

	import sys, os
	engine_path = os.getcwd() + '/../'
	sys.path = sys.path + [engine_path]
	import util

	adducts = [ "H", "Na", "K" ]

	parser = argparse.ArgumentParser(description='Insert pickled results to DB.')
	parser.add_argument('--in', dest='fname', type=str, help='input filename')
	parser.add_argument('--config', dest='config', type=str, help='config filename')
	parser.add_argument('--jobid', dest='jobid', type=int, help='job id')
	parser.add_argument('--dsid', dest='dsid', type=int, help='dataset id')
	parser.set_defaults(config='config.json', fname='result.pkl', dsid=0)
	args = parser.parse_args()

	with open(args.config) as f:
	# with open("config.json") as f:
		config = json.load(f)

	config_db = config["db"]

	util.my_print("Connecting to DB...")

	conn = psycopg2.connect("dbname=%s user=%s password=%s host=%s" % (config_db['db'], config_db['user'], config_db['password'], config_db['host']) )
	cur = conn.cursor()


	job_id = args.jobid
	if job_id == None:
		cur.execute("SELECT max(id) FROM jobs")
		try:
			job_id = cur.fetchone()[0] + 1
		except:
			job_id = 0
		util.my_print("No job id specified, using %d and inserting to jobs" % job_id)
		cur.execute("INSERT INTO jobs VALUES (%d, 1, -1, %d, true, 'SUCCEEDED', 0, 0, '2000-01-01 00:00:00', '2000-01-01 00:00:00')" %
			(job_id, args.dsid) )

	util.my_print("Reading %s..." % args.fname)
	with open(args.fname) as f:
		r = cPickle.load(f)


	if sum(r["lengths"]) > 0:
		util.my_print("Inserting to job_result_data...")
		cur.execute("INSERT INTO job_result_data VALUES %s" %
			",".join(['(%d, %d, %d, %d, %d, %.6f)' % (job_id,
				int(r["formulas"][i]),
				int(r["mzadducts"][i]), j, k, v)
				for i in xrange(len(r["res_dicts"])) for j in xrange(len(r["res_dicts"][i])) for k,v in r["res_dicts"][i][j].iteritems()])
		)

		util.my_print("Inserting to job_result_stats...")
		for stdict in r["stat_dicts"]:
			if "entropies" in stdict:
				stdict.update({ 'mean_ent' : np.mean(stdict["entropies"]) })

		cur.execute('INSERT INTO job_result_stats VALUES %s' % (
			",".join([ '(%d, %s, %d, %d, \'%s\')' % (job_id, r["formulas"][i], r["mzadducts"][i], r["lengths"][i], json.dumps(
				r["stat_dicts"][i]
			)) for i in xrange(len(r["formulas"])) ])
		) )

	conn.commit()
	conn.close()

	util.my_print("All done!")


if __name__ == "__main__":
    main()

