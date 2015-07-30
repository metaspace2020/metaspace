"""
.. module:: computing_deprecated
    :synopsis: Computing functions that are no longer used; mostly functions related to processing text files immediately and blockentropy.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""


import numpy as np
import numpy.linalg
import bisect

import numpy as np
from math import log
from scipy import ndimage, misc, ndarray, interpolate 

def join_strings(s1, s2):
	if s1 == "":
		return s2
	elif s2 == "":
		return s1
	else:
		return s1 + " " + s2

def get_one_group_total_txt(name, mz_lower, mz_upper, mzs, intensities):
    res = get_one_group_total(mz_lower, mz_upper, mzs, intensities)
    if res > 0.0001:
    	return "%s:%.4f" % (name, res)
    else:
    	return ""

def get_many_groups_total_txt(queries, sp):
	return [get_one_group_total_txt(sp[0], q[0], q[1], sp[1], sp[2]) for q in queries]

def reduce_manygroups_txt(x, y):
	return [ join_strings(x[i], y[i]) for i in xrange(len(x))]

def get_many_groups2d_total_txt(data, sp):
	return [ [get_one_group_total_txt(sp[0], q[0], q[1], sp[1], sp[2]) for q in queries] for queries in data]

def reduce_manygroups2d_txt(xarray, yarray):
	return [ [ join_strings(xarray[i][j], yarray[i][j]) for j in xrange(len(xarray[i]))] for i in xrange(len(xarray)) ]


def dicts_to_dict(dictresults):
	res_dict = dictresults[0]
	for res in dictresults[1:]:
		res_dict.update(dict( (k, v + res_dict.get(k, 0.0)) for k,v in res.iteritems()) )
	return res_dict

def get_many_groups2d_total_dict(data, sp):
	# return [ [get_one_group_total_dict(sp[0], q[0], q[1], sp[1], sp[2]) for q in queries] for queries in data]
	return [ get_many_groups_total_dict(queries, sp) for queries in data]

def get_many_groups_total_dict(queries, sp):
	res = get_one_group_total_dict(sp[0], queries[0][0], queries[0][1], sp[1], sp[2])
	for q in queries[1:]:
		res = join_dicts(res, get_one_group_total_dict(sp[0], q[0], q[1], sp[1], sp[2]))
	return res

def simple_entropy(arr, levels=100, size=9.0):
	'''Computes simple entropy of an array.'''
	cnts = {}
	for x in arr:
		cnts[x] = cnts.get(x, 0) + 1
	return np.sum( [ v * log(size / v) for k,v in cnts.iteritems() if v > 0 ] ) / size

def get_block_entropy_dict(d, nrows, ncols, K=20, M=3, levels=100):
	'''Computes average block entropy for an image given as a dictionary.'''
	norm = np.linalg.norm(d.values())
	if norm == 0:
		return 0
	patch_coords = [ np.random.randint(nrows-M, size=K), np.random.randint(ncols-M, size=K) ]
	patch_indices = [ np.array([ nrows*i+j for i in xrange(patch_coords[0][k], patch_coords[0][k]+M) for j in xrange(patch_coords[1][k], patch_coords[1][k]+M) ]) for k in xrange(K) ]
	patch_size = float(M*M)
	return np.mean([ simple_entropy( [ int( levels*d.get(index, 0.0) / norm ) for index in patch_indices[k] ], levels=levels, size=patch_size ) for k in xrange(K) ])


def corr_dicts(a, b):
    commonkeys = [ k for k in a if k in b ]
    return np.corrcoef(np.array([ a[k] for k in commonkeys ]), np.array([ b[k] for k in commonkeys ]))[0][1]

