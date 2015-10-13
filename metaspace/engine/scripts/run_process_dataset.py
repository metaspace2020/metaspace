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
    :param --ds: dataset file path
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
        import json
        ds_config = json.load(f)

    util.my_print("Reading %s..." % args.queries)
    with open(args.queries) as f:
        q = cPickle.load(f)

    util.my_print("Looking for %d peaks" % sum([len(x) for x in q["data"]]))
    util.my_print("Processing...")

    from engine.mol_searcher import MolSearcher
    searcher = MolSearcher(args.ds_path, args.coord_path, q['data'], np.array(q['intensities']), ds_config)
    found_mol_iso_images, found_mol_measures = searcher.run()
    results = convert_search_results(found_mol_iso_images, found_mol_measures,
                                    q["formulas"], q["mzadducts"])

    util.my_print("Saving results to %s..." % args.fname)

    with open(args.out_fn, "w") as outf:
        cPickle.dump(results, outf)

    util.my_print("All done!")
    time_spent = time.time() - start
    print 'Time spent: %d mins %d secs' % (int(round(time_spent/60)), int(round(time_spent%60)))


if __name__ == "__main__":
    main()
