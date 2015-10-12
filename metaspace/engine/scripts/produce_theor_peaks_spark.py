__author__ = 'intsco'
"""
.. module:: addpeaks_spark
    :synopsis: Script for producing m/z peaks with help of Spark.

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""

import psycopg2
import json
import argparse
from engine import isocalc
from pyspark import SparkContext, SparkConf
from itertools import product


def main():
    parser = argparse.ArgumentParser(description='Add molecule peaks script')
    parser.add_argument('--config', dest='config_path', type=str, help='sm config file path')
    parser.add_argument('--ds-config', dest='ds_config_path', type=str, help='dataset config file path')
    args = parser.parse_args()

    # SM config
    with open(args.config_path) as f:
        config_db = json.load(f)['db']
    conn = psycopg2.connect(**config_db)

    # Dataset config
    with open(args.ds_config_path) as f:
        ds_config = json.load(f)
    db_id = ds_config['inputs']['database_id']

    print 'Selecting all formulas from {} table, molecule db id = {}...'.format(config_db['database'], db_id)
    with conn.cursor() as curs:
        curs.execute('SELECT id, sf FROM agg_formula where db_id = %s', (db_id,))
        formulas = list(curs.fetchall())

    conf = SparkConf()
    sc = SparkContext(conf=conf, master='local[8]')
    formula_rdd = sc.parallelize(formulas).repartition(8)

    def format_peak_str(sf_id, adduct, iso_dict):
        return '%s\t%s\t%s\t{%s}\t{%s}\t{%s}\t{%s}' % (
            db_id, sf_id, adduct,
            ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['centr_mzs'])),
            ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['centr_ints'])),
            ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['profile_mzs'])),
            ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['profile_ints']))
        )

    peak_lines = (formula_rdd
        .flatMap(lambda (sf_id, sf): isocalc.get_iso_peaks(sf_id, sf, ds_config['isotope_generation']))
        .map(lambda args: format_peak_str(*args))
        .collect())

    out_file_path = '../data/theor_peaks_db_id_{}.csv'.format(db_id)

    with open(out_file_path, 'w') as f:
        f.write('\n'.join(peak_lines))
    print 'Finished iso pattern generation'

    print 'Importing theor peaks to the database...'
    with conn.cursor() as curs, open(out_file_path) as peaks_file:
        curs.execute('delete from theor_peaks where db_id = %s', (db_id,))
        curs.copy_from(peaks_file, 'theor_peaks')
    conn.commit()
    print 'Finished'

if __name__ == "__main__":
    main()