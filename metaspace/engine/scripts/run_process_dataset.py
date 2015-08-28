"""
.. module:: run_process_dataset
    :synopsis: Script for processing a dataset.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""

# import numpy as np
# import json
import argparse
import cPickle

import sys
from os.path import dirname, realpath
# engine_path = dirname(dirname(realpath(__file__)))
# sys.path.append(engine_path)

from pyspark import SparkContext, SparkConf


def main():
    """Processes a full dataset query (on pickled m/z values) and writes the pickled result.

    :param --out: output filename (defaults to result.pkl)
    :param --queries: queries to be run (defaults to queries.pkl)
    :param --ds: dataset file name
    :param --rows: number of rows in the dataset (needed to compute image-based metrics)
    :param --cols: number of columns in the dataset (needed to compute image-based metrics)
    :param --job_id: job id for the database
    """

    parser = argparse.ArgumentParser(description='IMS process dataset at a remote spark location.')
    parser.add_argument('--out', dest='fname', type=str, help='filename')
    parser.add_argument('--job_id', dest='job_id', type=int, help='job id for the database')
    parser.add_argument('--rows', dest='rows', type=int, help='number of rows')
    parser.add_argument('--cols', dest='cols', type=int, help='number of columns')
    parser.add_argument('--ds', dest='ds', type=str, help='dataset file name')
    parser.add_argument('--queries', dest='queries', type=str, help='queries file name')
    parser.add_argument('--config', dest='config_path', type=str, help='config file path')
    parser.set_defaults(config='config.json', queries='queries.pkl', fname='result.pkl', ds='', job_id=0, rows=-1,
                        cols=-1)

    # adducts = [ "H", "Na", "K" ]
    fulldataset_chunk_size = 1000

    from engine import util
    from engine import computing
    from engine.pyIMS.image_measures.level_sets_measure import measure_of_chaos_dict

    def get_full_dataset_results(res_dicts, formulas, mzadducts, intensities, nrows, ncols, job_id=0,
                                 offset=0):
        iso_spec_corr_tol = 0.5
        iso_img_corr_tol = 0.85
        measure_of_chaos_tol = 0.99
        # n = 100
        # iso_corr_tol = 0.5 / n
        # iso_ratio_tol = 0.85 / n
        # measure_tol = 0.99 / n

        total_nonzero = sum([len(x) for x in res_dicts])
        util.my_print("Got result of full dataset job %d with %d nonzero centroid intensities" % (job_id, total_nonzero))
        corr_images = [computing.avg_img_correlation(res_dicts[i]) for i in xrange(len(res_dicts))]
        corr_int = [computing.avg_intensity_correlation(res_dicts[i], intensities[i]) for i in xrange(len(res_dicts))]
        chaos_measures = [1 - measure_of_chaos_dict(res_dicts[i][0], nrows, ncols)
                          if corr_int[i] > iso_spec_corr_tol and corr_images[i] > iso_img_corr_tol else 0
                          for i in xrange(len(res_dicts))]

        to_insert = [i for i in xrange(len(res_dicts))
                     if corr_int[i] > iso_spec_corr_tol and corr_images[i] > iso_img_corr_tol and chaos_measures[i] > measure_of_chaos_tol]
        util.my_print('{} sum formula results to insert'.format(len(to_insert)))

        return ([formulas[i + offset][0] for i in to_insert],
                [int(mzadducts[i + offset]) for i in to_insert],
                [len(res_dicts[i]) for i in to_insert],
                [{
                     "corr_images": corr_images[i],
                     "corr_int": corr_int[i],
                     "chaos": chaos_measures[i]
                 } for i in to_insert],
                [res_dicts[i] for i in to_insert])

    args = parser.parse_args()

    if args.ds == '':
        print "Must specify dataset as --ds=filename!"
        exit(0)

    util.my_print("Reading %s..." % args.queries)
    with open(args.queries) as f:
        q = cPickle.load(f)

    util.my_print("Looking for %d peaks" % sum([len(x) for x in q["data"]]))
    num_chunks = 1 + len(q["data"]) / fulldataset_chunk_size

    conf = SparkConf().set('spark.python.profile', True)
    # sc = SparkContext(conf=conf, master='local')
    sc = SparkContext(conf=conf)

    ff = sc.textFile(args.ds, minPartitions=10)
    spectra = ff.map(computing.txt_to_spectrum)
    spectra.cache()

    res = {
        "formulas": [],
        "mzadducts": [],
        "lengths": [],
        "stat_dicts": [],
        "res_dicts": []
    }

    for i in xrange(num_chunks):
        util.my_print("Processing chunk %d..." % i)

        mol_mz_intervals = q["data"][fulldataset_chunk_size * i:fulldataset_chunk_size * (i + 1)]
        qres = (spectra.map(lambda sp: computing.process_spectrum_multiple_queries(mol_mz_intervals, sp))
                .reduce(computing.reduce_manygroups2d_dict_individual))

        cur_results = get_full_dataset_results(qres, q["formulas"], q["mzadducts"], q["intensities"],
                                               args.rows, args.cols, args.job_id, fulldataset_chunk_size * i)

        res["formulas"].extend([n + fulldataset_chunk_size * i for n in cur_results[0]])
        res["mzadducts"].extend(cur_results[1])
        res["lengths"].extend(cur_results[2])
        res["stat_dicts"].extend(cur_results[3])
        res["res_dicts"].extend(cur_results[4])

    util.my_print("Saving results to %s..." % args.fname)

    with open(args.fname, "w") as outf:
        cPickle.dump(res, outf)

    util.my_print("All done!")


if __name__ == "__main__":
    main()
