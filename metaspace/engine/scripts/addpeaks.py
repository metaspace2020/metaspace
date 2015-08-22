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
    args = parser.parse_args()

    with open(args.config_path) as f:
        config_db = json.load(f)['db']

    print 'Selecting all formulas from {} database...'.format(config_db['database'])
    conn = psycopg2.connect(**config_db)
    with conn.cursor() as curs:
        curs.execute('SELECT id, sf FROM agg_formulas')

        adducts = ["H", "Na", "K"]

        # mzpeaks = {}
        # mzints = {}
        # peaks = {}
        i = 0
        out_fn = 'mz_peaks.csv'
        with open(out_fn, 'w') as out_file:
            for id, sf in curs.fetchall():
                for add_id, _ in enumerate(adducts):
                    iso_dict = isocalc.get_lists_of_mzs(sf + adducts[add_id])
                    # mzpeaks[(id, i)] = d["grad_mzs"]
                    # mzints[(id, i)] = d["grad_int"]
                    # peaks[(id, add_id)] = (d['grad_mzs'], d['grad_int'])

                    out_file.write('%s\t%d\t{%s}\t{%s}\n' % (
                        id, add_id,
                        ','.join(map(lambda x: '{:.4f}'.format(x), iso_dict['grad_mzs'])),
                        ','.join(map(lambda x: '{:.4f}'.format(x), iso_dict['grad_ints']))
                    ))

                i += 1
                if i % 100 == 0:
                    print 'Saved peaks for {} formulas'.format(i)
        print 'Saved all formula peaks to {}'.format(out_fn)

    print 'Importing peaks to the database...'
    with conn.cursor() as curs:
        curs.execute('truncate mz_peaks;')

    local(''' psql -h {} -U {} {} -c "\copy mz_peaks from '{}/{}'" '''.format(
        config_db['host'], config_db['user'], config_db['database'], dirname(realpath(__file__)), out_fn
    ))

    conn.close()
    print 'Finished'

    # print 'Saving molecule peaks to {} file...'.format(out_fn)
    # with open(out_fn, 'w') as outfile:
    #     for (id, add_id), (mzs, ints) in peaks.iteritems():
    #         outfile.write('{};{};{};{}\n'.format(
    #             id, add_id,
    #             ','.join(map(lambda x: '{.4f}'.format(x), mzs)),
    #             ','.join(map(lambda x: '{.4f}'.format(x), ints))
    #         ))

        # outfile.write("\n".join(["%s;%d;{%s};{%s}" %
        #                          (k[0], k[1], ",".join(["%.4f" % x for x in mzpeaks[k]]), ",".join(["%.4f" % x for x in mzints[k]]) )
        #                          for k in mzpeaks if len(mzpeaks[k]) > 0 ]))


if __name__ == "__main__":
    main()