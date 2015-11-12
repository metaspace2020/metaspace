"""
.. module:: run_process_dataset
    :synopsis: Script for processing a dataset.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
.. moduleauthor:: Artem Tarasov <lomereiter@gmail.com>
"""
import argparse
import cPickle
import numpy as np
import time
import json

from pyspark import SparkContext, SparkConf


def main():
    """

    """
    parser = argparse.ArgumentParser(description='SM process dataset at a remote spark location.')
    parser.add_argument('--out', dest='out_fn', type=str, help='filename')
    parser.add_argument('--ds', dest='ds_path', type=str, help='dataset file name')
    parser.add_argument('--coord', dest='coord_path', type=str, help='dataset coordinates file name')
    parser.add_argument('--queries', dest='queries', type=str, help='queries file name')
    parser.add_argument('--ds-config', dest='ds_config_path', type=str, help='dataset config file path')
    parser.set_defaults(queries='queries.pkl', fname='result.pkl')

    from collections import defaultdict
    from engine import util

    def convert_search_results(mol_iso_images, mol_measures, formulas, mzadducts):
        res = defaultdict(list)
        for sf_i, measures in mol_measures.iteritems():
            res['formulas'].append(formulas[sf_i][0])
            res['mzadducts'].append(mzadducts[sf_i])
            res['stat_dicts'].append(dict(zip(['moc', 'spec', 'spat'], measures)))
            res['res_dicts'].append(mol_iso_images[sf_i])
        return res

    start = time.time()
    args = parser.parse_args()

    # Dataset config
    with open(args.ds_config_path) as f:
        ds_config = json.load(f)

    # SM config
    with open('../conf/config.json') as f:
        sm_config = json.load(f)

    util.my_print("Reading %s..." % args.queries)
    with open(args.queries) as f:
        q = cPickle.load(f)

    util.my_print("Looking for %d peaks" % sum([len(x) for x in q["data"]]))
    util.my_print("Processing...")

    # Spark context setup
    sconf = (SparkConf()
              # .set('spark.python.profile', True)
              .set("spark.executor.memory", "2g")
              .set("spark.serializer", "org.apache.spark.serializer.KryoSerializer"))
    sc = SparkContext(conf=sconf)

    # Import
    from engine.db import DB
    from engine.dataset import Dataset
    from engine.formulas import Formulas
    from engine.formula_imager import sample_spectra, compute_sf_peak_images, compute_sf_images
    from engine.formula_img_validator import filter_sf_images

    # Create and init
    ds = Dataset(sc, args.ds_path, args.coord_path)
    db = DB(sm_config['db'])
    formulas = Formulas(ds_config, db)

    # Run search
    sf_sp_intens = sample_spectra(sc, ds, formulas)
    sf_peak_imgs = compute_sf_peak_images(ds, sf_sp_intens)
    sf_images = compute_sf_images(sf_peak_imgs)
    sf_iso_images_map, sf_metrics_map = filter_sf_images(ds_config, ds, formulas, sf_images)

    results = convert_search_results(sf_iso_images_map, sf_metrics_map,
                                     q["formulas"], q["mzadducts"])

    util.my_print("Saving results to %s..." % args.fname)

    with open(args.out_fn, "w") as outf:
        cPickle.dump(results, outf)

    util.my_print("All done!")
    time_spent = time.time() - start
    print 'Time spent: %d mins %d secs' % (int(round(time_spent/60)), int(round(time_spent%60)))


if __name__ == "__main__":
    main()
