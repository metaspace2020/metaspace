import numpy as np

from math import log

def simple_entropy(arr, levels=100, size=9.0):
	cnts = {}
	for x in arr:
		cnts[x] = cnts.get(x, 0) + 1
	return np.sum( [ v * log(size / v) for k,v in cnts.iteritems() if v > 0 ] ) / size

def get_block_entropy_dict(d, nrows, ncols, K=20, M=3, levels=100):
	norm = np.linalg.norm(d.values())
	if norm == 0:
		return 0
	patch_coords = [ np.random.randint(nrows-M, size=K), np.random.randint(ncols-M, size=K) ]
	patch_indices = [ np.array([ nrows*i+j for i in xrange(patch_coords[0][k], patch_coords[0][k]+M) for j in xrange(patch_coords[1][k], patch_coords[1][k]+M) ]) for k in xrange(K) ]
	patch_size = float(M*M)
	return np.mean([ simple_entropy( [ int( levels*d.get(index, 0.0) / norm ) for index in patch_indices[k] ], levels=levels, size=patch_size ) for k in xrange(K) ])


