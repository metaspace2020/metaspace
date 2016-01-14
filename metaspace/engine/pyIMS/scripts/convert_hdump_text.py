from __future__ import print_function

import numpy as np
import sys
import datetime
import copy
import cPickle
import gzip

def my_print(s):
    print("[" + str(datetime.datetime.now()) + "] " + s, file=sys.stderr)


# my_print("Reading %s..." % sys.argv[1])

cur_group = -1
cur_mzs = []
cur_intensities = []
arr = []
cur_mode = 0

if len(sys.argv) < 2 or sys.argv[1] == 'stdin':
    f = sys.stdin
else:
    if sys.argv[1][-2:] == 'gz':
        my_print("\tfile gzipped, extracting...")
        f = gzip.open(sys.argv[1], 'rb')
    else:
        f = open(sys.argv[1])

fout = sys.stdout

for line in f:
    l = line.strip()
    if l.startswith('GROUP "') and l[7].isdigit():
        if cur_group >= 0:
            my_print("\tgroup ended with %d mzs and %d intensities" % (len(cur_mzs), len(cur_intensities)))
            if len(cur_mzs) > 0 and len(cur_mzs) != len(cur_intensities):
                my_print("\t\tERROR! Size mismatch!")
            if len(cur_mzs) > 0:
                cur_mzs = np.array(cur_mzs)[np.array(cur_intensities) > 0]
                cur_intensities = np.array(cur_intensities)[np.array(cur_intensities) > 0]
                my_print("\tsaving %d mzs with %d nonzero intensities" % (len(cur_mzs), len(cur_intensities)))
                fout.write(str(cur_group) + "|" + " ".join([str(x) for x in cur_intensities]) + "|" + " ".join([str(x) for x in cur_mzs]) + "\n")
            else:
                my_print("\tno mzs, saving only %d intensities" % (len(cur_intensities)))
                fout.write(str(cur_group) + "|" + " ".join([str(x) for x in cur_mzs]) + "\n")
            del cur_mzs
            del cur_intensities
            cur_mzs = []
            cur_intensities = []
        cur_group = int(l.split('"')[1])
        my_print("\tgroup %d" % cur_group)
        cur_mode = 0
        continue
    if l.startswith('DATA {'):
        cur_mode += 1
        continue
    if l.startswith('DATASET "intensities"'):
        cur_mode = 1
        continue
    if l.startswith('DATASET "mzs"'):
        cur_mode = 5
        continue
    if l == '}':
        cur_mode = 0
    arr = l.split(',')
    for s in arr:
        try:
            f = float(s)
            if cur_mode == 2:
                cur_intensities.append(f)
            elif cur_mode == 6:
                cur_mzs.append(f)
        except:
            pass

f.close()

my_print("All done!")

exit(0)

