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

    from collections import defaultdict
    from engine import util
    from engine import computing, computing_fast, computing_fast_spark
    from engine.pyIMS.image_measures.level_sets_measure import measure_of_chaos
    from engine.pyIMS.image_measures.isotope_pattern_match import isotope_pattern_match
    from engine.pyIMS.image_measures.isotope_image_correlation import isotope_image_correlation

    minPartitions = 4

    # def img_pairs_to_list(pairs):
    #     pair_dict = dict(pairs)
    #     max_i = max(pair_dict.keys())+1
    #     return [pair_dict[i].toarray() if i in pair_dict else [] for i in xrange(max_i)]

    def compute_img_metrics(iso_images, sf_intensity):
        iso_imgs = [img.toarray() if img is not None else None for img in iso_images]

        if len(iso_imgs) == 0 or any(l is None for l in iso_images):
            return 0, 0, 0
        else:
            chaos = 1 - measure_of_chaos(iso_imgs[0].copy(), nlevels=30, interp=False, q_val=99.)[0]
            return (chaos if not np.isnan(chaos) and abs(chaos-1.0) > 1e-9 else 0,
                    isotope_image_correlation(iso_imgs, weights=sf_intensity[1:]),
                    isotope_pattern_match(iso_imgs, sf_intensity))

    def get_full_dataset_results(sc, sf_res_rdd, formulas, mzadducts, intensities, job_id=0):
        # measure_of_chaos_tol = 0.998
        # iso_img_corr_tol = 0.5
        # iso_pattern_match_tol = 0.85  # aka iso_ratio_tol

        # total_nonzero = sum([len(x) for x in sf_res_rdd])
        # util.my_print("Got result of full dataset job %d with %d nonzero centroid intensities" % (job_id, total_nonzero))

        thresholds = np.array([0.998, 0.5, 0.85])

        intensities_rdd = sc.parallelize(enumerate(intensities), numSlices=minPartitions)
        # sf_res_rdd = sc.parallelize(sf_res_rdd, numSlices=minPartitions)
        sf_metrics = (sf_res_rdd
                      .join(intensities_rdd)
                      # .mapValues(lambda (iso_imgs, sf_ints): compute_img_metrics(iso_imgs, sf_ints))
                      # .filter(lambda (_, metrics): np.all(np.array(metrics) > thresholds))
                      ).collect()

        passed_sf_i = set(map(lambda t: t[0], sf_metrics))
        sf_iso_images = sf_res_rdd.filter(lambda (sf_i, iso_imgs): sf_i in passed_sf_i).collect()

        res = defaultdict(list)
        for sf_i, metrics in sf_metrics:
            res['formulas'].append(formulas[sf_i][0])
            res['mzadducts'].append(mzadducts[sf_i])
            res['lengths'].append(0),
            res['stat_dicts'].append(dict(zip(['moc', 'spec', 'spat'], metrics)))
            res['res_dicts'].append(sf_iso_images[sf_i])
        return res

    start = time.time()

    args = parser.parse_args()

    util.my_print("Reading %s..." % args.queries)
    with open(args.queries) as f:
        q = cPickle.load(f)

    util.my_print("Looking for %d peaks" % sum([len(x) for x in q["data"]]))

    conf = SparkConf().set('spark.python.profile', True).set("spark.executor.memory", "1g")
    # sc = SparkContext(conf=conf, master='local[4]')
    sc = SparkContext(conf=conf)
    ff = sc.textFile(args.ds, minPartitions=minPartitions)
    spectra = ff.map(computing_fast_spark.txt_to_spectrum)
    spectra.cache()

    util.my_print("Processing...")

    mol_mz_intervals = q["data"]
    sf_res_rdd = computing_fast_spark.process_data(sc, spectra, mol_mz_intervals, args.rows, args.cols, minPartitions)
    results = get_full_dataset_results(sc, sf_res_rdd, q["formulas"], q["mzadducts"], q["intensities"], args.job_id)

    util.my_print("Saving results to %s..." % args.fname)

    with open(args.fname, "w") as outf:
        cPickle.dump(results, outf)

    util.my_print("All done!")
    time_spent = time.time() - start
    print 'Time spent: %d mins %d secs' % (int(round(time_spent/60)), int(round(time_spent%60)))


if __name__ == "__main__":
    main()
