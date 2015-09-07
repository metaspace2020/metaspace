"""
.. module:: run_process_dataset
    :synopsis: Script for processing a dataset.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
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

    import util
    from engine import computing, computing_fast, computing_fast_spark
    from engine.pyIMS.image_measures.level_sets_measure import measure_of_chaos
    from engine.pyIMS.image_measures.isotope_pattern_match import isotope_pattern_match
    from engine.pyIMS.image_measures.isotope_image_correlation import isotope_image_correlation

    def get_full_dataset_results(qres, formulas, mzadducts, intensities, job_id=0):
        measure_of_chaos_tol = 0.998
        iso_img_corr_tol = 0.5
        iso_pattern_match_tol = 0.85  # aka iso_ratio_tol
        # measure_of_chaos_tol = 0
        # iso_img_corr_tol = 0
        # iso_pattern_match_tol = 0

        total_nonzero = sum([len(x) for x in qres])
        util.my_print("Got result of full dataset job %d with %d nonzero centroid intensities" % (job_id, total_nonzero))

        chaos_measures, pattern_match, img_corr = [], [], []
        for i, iso_imgs in enumerate(qres):
            iso_imgs = [img.toarray() for img in iso_imgs]
            if len(iso_imgs) > 0:
                chaos = 1 - measure_of_chaos(iso_imgs[0], nlevels=30, interp=False, q_val=99.)[0]
                chaos_measures.append(chaos if not np.isnan(chaos) and abs(chaos-1.0) > 1e-9 else 0)
                img_corr.append(isotope_image_correlation(iso_imgs, weights=intensities[i][1:]))
                pattern_match.append(isotope_pattern_match(iso_imgs, intensities[i]))
            else:
                chaos_measures.append(0)
                img_corr.append(0)
                pattern_match.append(0)

        to_insert = [i for i, _ in enumerate(qres)
                     if pattern_match[i] > iso_pattern_match_tol and
                     img_corr[i] > iso_img_corr_tol and
                     chaos_measures[i] > measure_of_chaos_tol]
        util.my_print('{} sum formula results to insert'.format(len(to_insert)))

        return ([formulas[i][0] for i in to_insert],
                [int(mzadducts[i]) for i in to_insert],
                [len(qres[i]) for i in to_insert],
                [{
                    "moc": chaos_measures[i],
                    "spec": img_corr[i],
                    "spat": pattern_match[i]
                 } for i in to_insert],
                [qres[i] for i in to_insert])

    start = time.time()

    args = parser.parse_args()

    if args.ds == '':
        print "Must specify dataset as --ds=filename!"
        exit(0)

    util.my_print("Reading %s..." % args.queries)
    with open(args.queries) as f:
        q = cPickle.load(f)

    util.my_print("Looking for %d peaks" % sum([len(x) for x in q["data"]]))

    conf = SparkConf().set('spark.python.profile', True).set("spark.executor.memory", "2g")
    sc = SparkContext(conf=conf, master='local[4]')
    ff = sc.textFile(args.ds, minPartitions=4)
    spectra = ff.map(computing_fast_spark.txt_to_spectrum)
    spectra.cache()

    util.my_print("Processing...")

    mol_mz_intervals = q["data"]
    qres = computing_fast_spark.process_data(spectra, mol_mz_intervals, args.rows, args.cols)
    cur_results = get_full_dataset_results(qres, q["formulas"],
                                           q["mzadducts"], q["intensities"], args.job_id)

    res = {
        "formulas": cur_results[0],
        "mzadducts": cur_results[1],
        "lengths": cur_results[2],
        "stat_dicts": cur_results[3],
        "res_dicts": cur_results[4]
    }

    util.my_print("Saving results to %s..." % args.fname)

    with open(args.fname, "w") as outf:
        cPickle.dump(res, outf)

    util.my_print("All done!")
    time_spent = time.time() - start
    print 'Time spent: %d mins %d secs' % (int(round(time_spent/60)), int(round(time_spent%60)))


if __name__ == "__main__":
    main()
