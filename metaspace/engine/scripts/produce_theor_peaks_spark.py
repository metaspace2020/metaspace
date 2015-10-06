__author__ = 'intsco'
"""
.. module:: addpeaks_spark
    :synopsis: Script for producing m/z peaks with help of Spark.

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""

"""
This script:

* connects to the database with hardcoded config,

* selects all sum formulas from the agg_formulas table,

* writes to a separate file mz_peaks.csv all peaks for all sum formulas.
"""
import psycopg2
import json
import argparse
from engine import isocalc
from pyspark import SparkContext, SparkConf
from itertools import product


def main():
    parser = argparse.ArgumentParser(description='Add molecule peaks script')
    parser.add_argument('--config', dest='config_path', type=str, help='config file path')
    parser.add_argument('--out', dest='out_file_path', type=str, help='out file path')
    parser.set_defaults(out_file_path='mz_peaks.csv')
    args = parser.parse_args()

    with open(args.config_path) as f:
        config_db = json.load(f)['db']

    print 'Selecting all formulas from {} database...'.format(config_db['database'])
    conn = psycopg2.connect(**config_db)
    with conn.cursor() as curs:
        curs.execute('SELECT id, sf FROM agg_formulas limit 100')
        formulas = list(curs.fetchall())

    adducts = ["H", "Na", "K"]
    formula_adduct_pairs = product(formulas, enumerate(adducts))

    conf = SparkConf()
    sc = SparkContext(conf=conf, master='local[8]')
    formula_adduct_rdd = sc.parallelize(formula_adduct_pairs).repartition(8)

    def format_peak_str(sf_id, add_id, iso_dict):
        return '%s\t%d\t{%s}\t{%s}\t{%s}\t{%s}' % (
            sf_id, add_id,
            ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['centr_mzs'])),
            ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['centr_ints'])),
            ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['profile_mzs'])),
            ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['profile_ints']))
        )

    peak_lines = (formula_adduct_rdd
        .map(lambda ((sf_id, sf), (add_id, adduct)): (sf_id, add_id, isocalc.get_iso_peaks(sf + adduct)))
        .map(lambda args: format_peak_str(*args))
        .collect())

    with open(args.out_file_path, 'w') as f:
        f.write('\n'.join(peak_lines))

    print 'Finished'


if __name__ == "__main__":
    main()