from pyspark import SparkContext, SparkConf

import numpy as np
import sys
import bisect
import datetime

def txt_to_keyval(s):
    arr = s.strip().split("|")
    return ( arr[0], arr[1] + "|" + arr[2] )

conf = SparkConf().setAppName("Converting to sequence files").setMaster("local[*]")
sc = SparkContext(conf=conf)

## this reads a regular text file
ff = sc.textFile("/media/data/ims/Ctrl3s2_SpheroidsCtrl_DHBSub_IMS.txt")
## and this is Hadoop HDFS
# ff = sc.textFile("hdfs://localhost:9000/user/snikolenko/Ctrl3s2_SpheroidsCtrl_DHBSub_IMS.txt")

spectra = ff.map(txt_to_keyval)
spectra.saveAsSequenceFile("/media/data/ims/sparksequence")

sc.stop()
exit(0)

