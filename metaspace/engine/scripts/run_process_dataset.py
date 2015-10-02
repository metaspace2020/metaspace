"""
.. module:: run_process_dataset
    :synopsis: Script for processing a dataset.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
.. moduleauthor:: Artem Tarasov <lomereiter@gmail.com>
"""

# import numpy as np
# import json
import argparse
import cPickle
import numpy as np
import time

# engine_path = dirname(dirname(realpath(__file__)))
# sys.path.append(engine_path)

from pyspark import SparkContext, SparkConf


def main():
    """Processes a full dataset query (on pickled m/z values) and writes the pickled result.

    :param --out: output filename (defaults to result.pkl)
    :param --queries: queries to be run (defaults to queries.pkl)
    :param --ds: dataset file name
    :param --rows: number of rows in the dataset (needed to compute image-based measures)
    :param --cols: number of columns in the dataset (needed to compute image-based measures)
    :param --job_id: job id for the database
    """
    parser = argparse.ArgumentParser(description='IMS process dataset at a remote spark location.')
    parser.add_argument('--out', dest='fname', type=str, help='filename')
    parser.add_argument('--job_id', dest='job_id', type=int, help='job id for the database')
    parser.add_argument('--rows', dest='rows', type=int, help='number of rows')
    parser.add_argument('--cols', dest='cols', type=int, help='number of columns')
    parser.add_argument('--ds', dest='ds', type=str, help='dataset file name')
    parser.add_argument('--coord', dest='coord', type=str, help='dataset coordinates file name')
    parser.add_argument('--queries', dest='queries', type=str, help='queries file name')
    parser.add_argument('--config', dest='config_path', type=str, help='config file path')
    parser.set_defaults(config='config.json', queries='queries.pkl', fname='result.pkl', ds='', job_id=0, rows=-1,
                        cols=-1)

    from collections import defaultdict
    from engine import util
    from engine import computing, computing_fast, computing_fast_spark
    from engine.pyIMS.image_measures.level_sets_measure import measure_of_chaos
    from engine.pyIMS.image_measures.isotope_pattern_match import isotope_pattern_match
    from engine.pyIMS.image_measures.isotope_image_correlation import isotope_image_correlation

    minPartitions = 8

    # def img_pairs_to_list(pairs):
    #     pair_dict = dict(pairs)
    #     max_i = max(pair_dict.keys())+1
    #     return [pair_dict[i].toarray() if i in pair_dict else [] for i in xrange(max_i)]

    def convert_search_results(mol_iso_images, mol_measures, formulas, mzadducts, job_id=0):
        res = defaultdict(list)
        for sf_i, measures in mol_measures.iteritems():
            res['formulas'].append(formulas[sf_i][0])
            res['mzadducts'].append(mzadducts[sf_i])
            res['stat_dicts'].append(dict(zip(['moc', 'spec', 'spat'], measures)))
            res['res_dicts'].append(mol_iso_images[sf_i])
        return res

    start = time.time()

    args = parser.parse_args()

    util.my_print("Reading %s..." % args.queries)
    with open(args.queries) as f:
        q = cPickle.load(f)

    util.my_print("Looking for %d peaks" % sum([len(x) for x in q["data"]]))

    # conf = SparkConf().set('spark.python.profile', 'true')\
    #     .set('spark.python.profile.dump', '/home/intsco/embl/SpatialMetabolomics/spark_profiling')\
    #     .set("spark.executor.memory", "1g")
    # sc = SparkContext(conf=conf)
    # ff = sc.textFile(args.ds, minPartitions=minPartitions)
    # spectra = ff.map(txt_to_spectrum)
    # spectra.cache()

    util.my_print("Processing...")

    # mol_mz_intervals = q["data"]
    # sf_res_rdd = search_peak_ints(sc, spectra, mol_mz_intervals, args.rows, args.cols, minPartitions)
    # results = result = convert_search_results(sc, sf_res_rdd, q["formulas"], q["mzadducts"], q["intensities"],
    #                                    args.rows, args.cols, args.job_id)

    from engine.mol_searcher import MolSearcher
    searcher = MolSearcher(args.ds, args.coord, q['data'], np.array(q['intensities']))
    found_mol_iso_images, found_mol_measures = searcher.run()
    results = convert_search_results(found_mol_iso_images, found_mol_measures,
                                    q["formulas"], q["mzadducts"], args.job_id)

    util.my_print("Saving results to %s..." % args.fname)

    with open(args.fname, "w") as outf:
        cPickle.dump(results, outf)

    util.my_print("All done!")
    time_spent = time.time() - start
    print 'Time spent: %d mins %d secs' % (int(round(time_spent/60)), int(round(time_spent%60)))


if __name__ == "__main__":
    main()
