"""
.. module:: add_peaks
    :synopsis: Script for producing m/z peaks.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""

'''
This script:

* connects to the database with hardcoded config,

* selects all sum formulas from the agg_formulas table,

* writes to a separate file mzpeaks.csv all peaks for all sum formulas.
'''
import psycopg2
from os.path import dirname, realpath
# engine_path = os.getcwd() + '/../'
# sys.path = sys.path + [engine_path]
import json
import argparse
from engine import isocalc
from fabric.api import local


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
        curs.execute('SELECT id, sf FROM agg_formulas')

        adducts = ["H", "Na", "K"]

        i = 0
        with open(args.out_file_path, 'w') as out_file:
            for id, sf in curs.fetchall():
                for add_id, _ in enumerate(adducts):
                    iso_dict = isocalc.get_iso_peaks(sf + adducts[add_id])

                    out_file.write('%s\t%d\t{%s}\t{%s}\n' % (
                        id, add_id,
                        ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['centr_mzs'])),
                        ','.join(map(lambda x: '{:.9f}'.format(x), iso_dict['centr_ints']))
                    ))

                i += 1
                if i % 10 == 0:
                    print 'Saved peaks for {} formulas\r'.format(i),
        print 'Saved all formula peaks to {}'.format(args.out_file_path)

    print 'Importing peaks to the database...'
    with conn.cursor() as curs, open(args.out_file_path) as mzfile:
        curs.execute('truncate mz_peaks;')
        curs.copy_from(mzfile, 'mz_peaks')

    # local('''PGPASSWORD={} psql -h {} -U {} {} -c "\copy mz_peaks from '{}'" '''.format(
    #     config_db['password'], config_db['host'], config_db['user'], config_db['database'], args.out_file_path
    # ))
    conn.commit()
    conn.close()
    print 'Finished'


if __name__ == "__main__":
    main()