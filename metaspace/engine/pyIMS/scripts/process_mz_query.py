from __future__ import print_function

import numpy as np
import sys
import bisect
import datetime
import gzip

def my_print(s):
    print("[" + str(datetime.datetime.now()) + "] " + s, file=sys.stderr)

if len(sys.argv) < 3:
    print("Usage: process_mz_query.py dump_file[.gz] query_file")
    exit(0)

my_print("Reading dump file from %s..." % sys.argv[1])

if sys.argv[1][-2:] == 'gz':
    f = gzip.open(sys.argv[1], 'rb')
else:
    f = open(sys.argv[1])

spectra = []
arr = []
for line in f:
    arr = line.strip().split("|")
    if len(arr) < 3:
        continue
    spectra.append( ( arr[0], np.array([ float(x) for x in arr[2].split(" ") ]), np.array([ float(x) for x in arr[1].split(" ") ]) ) )

f.close()

## at this point, spectra array contains triples of the form
##   (group_id, list of mzs, list of intensities)

my_print("Reading and processing queries from %s..." % sys.argv[2])

def get_one_group_total(mz_lower, mz_upper, mzs, intensities):
    return np.sum(intensities[ bisect.bisect_left(mzs, mz_lower) : bisect.bisect_right(mzs, mz_upper) ])

def get_all_totals(mz, tol, spectra):
    mz_lower = mz - tol
    mz_upper = mz + tol
    return [ (x[0], get_one_group_total(mz_lower, mz_upper, x[1], x[2])) for x in spectra ]

with open(sys.argv[2]) as f:
    for line in f:
        arr = line.strip().split(",")
        print(" ".join([ "%s:%.3f" % x for x in get_all_totals(float(arr[0]), float(arr[1]), spectra)]))

my_print("All done!")
exit(0)

