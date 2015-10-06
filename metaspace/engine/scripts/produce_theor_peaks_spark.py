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
    parser.set_defaults(out_file_path='theor_peaks.csv')
    args = parser.parse_args()

    with open(args.config_path) as f:
        config_db = json.load(f)['db']
    conn = psycopg2.connect(**config_db)

    print 'Selecting all formulas from {} database...'.format(config_db['database'])
    with conn.cursor() as curs:
        curs.execute('SELECT id, sf FROM agg_formulas')
        formulas = list(curs.fetchall())

    from random import shuffle
    adducts = ["H", "Na", "K"]
    shuffle(formulas)
    formula_adduct_pairs = product(formulas, adducts)

    conf = SparkConf()
    sc = SparkContext(conf=conf, master='local[8]')
    formula_adduct_rdd = sc.parallelize(formula_adduct_pairs).repartition(8)

    def format_peak_str(sf_id, adduct, iso_dict):
        return '%s\t%s\t{%s}\t{%s}\t{%s}\t{%s}' % (
            sf_id, adduct,
            ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['centr_mzs'])),
            ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['centr_ints'])),
            ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['profile_mzs'])),
            ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['profile_ints']))
        )

    peak_lines = (formula_adduct_rdd
        .map(lambda ((sf_id, sf), adduct): (sf_id, adduct, isocalc.get_iso_peaks(sf + adduct)))
        .map(lambda args: format_peak_str(*args))
        .collect())

    with open(args.out_file_path, 'w') as f:
        f.write('\n'.join(peak_lines))
    print 'Finished iso pattern generation'

    print 'Importing theor peaks to the database...'
    with conn.cursor() as curs, open(args.out_file_path) as peaks_file:
        curs.execute('truncate theor_peaks;')
        curs.copy_from(peaks_file, 'theor_peaks')
    conn.commit()
    print 'Finished'

if __name__ == "__main__":
    main()