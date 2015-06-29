import numpy as np
import numpy.linalg
import bisect

import numpy as np
from scipy import ndimage, misc, ndarray, interpolate 


from util import * 
from blockentropy import * 

def get_one_group_total(mz_lower, mz_upper, mzs, intensities):
    return np.sum(intensities[ bisect.bisect_left(mzs, mz_lower) : bisect.bisect_right(mzs, mz_upper) ])


def get_one_group_total_dict(name, mz_lower, mz_upper, mzs, intensities):
    res = get_one_group_total(mz_lower, mz_upper, mzs, intensities)
    if res > 0.0001:
    	return {int(name) : res}
    else:
    	return {}

def get_many_groups_total_dict_individual(queries, sp):
	res = dict( (k, [ get_one_group_total_dict(sp[0], q[0], q[1], sp[1], sp[2]) for q in v ]) for k,v in queries.iteritems())
	return res

def get_many_groups_total_arr_individual(queries, sp):
	return [ get_one_group_total_dict(sp[0], q[0], q[1], sp[1], sp[2]) for q in queries ]

def get_many_groups2d_total_dict_individual(data, sp):
	return [ get_many_groups_total_arr_individual(queries, sp) for queries in data]


def run_extractmzs(sc, fname, data, nrows, ncols):
	ff = sc.textFile(fname)
	spectra = ff.map(txt_to_spectrum)
	# qres = spectra.map(lambda sp : get_many_groups_total_dict(data, sp)).reduce(join_dicts)
	qres = spectra.map(lambda sp : get_many_groups_total_dict_individual(data, sp)).reduce(reduce_manygroups_dict)
	entropies = dict( (k, [ get_block_entropy_dict(x, nrows, ncols) for x in v ]) for k,v in qres.iteritems())
	return (qres, entropies)

def dicts_to_dict(dictresults):
	res_dict = dictresults[0]
	for res in dictresults[1:]:
		res_dict.update(dict( (k, v + res_dict.get(k, 0.0)) for k,v in res.iteritems()) )
	return res_dict

def run_fulldataset(sc, fname, data, nrows, ncols):
	ff = sc.textFile(fname)
	spectra = ff.map(txt_to_spectrum)
	qres = spectra.map(lambda sp : get_many_groups2d_total_dict_individual(data, sp)).reduce(reduce_manygroups2d_dict_individual)
	entropies = [ [ get_block_entropy_dict(x, nrows, ncols) for x in res ] for res in qres ]
	return (qres, entropies)

def txt_to_spectrum(s):
    arr = s.strip().split("|")
    return ( arr[0], np.array([ float(x) for x in arr[2].split(" ") ]), np.array([ float(x) for x in arr[1].split(" ") ]) )

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

def join_strings(s1, s2):
	if s1 == "":
		return s2
	elif s2 == "":
		return s1
	else:
		return s1 + " " + s2


def join_dicts(s1, s2):
	s1.update(dict( (k, v + s1.get(k, 0.0) ) for k,v in s2.iteritems() ) )
	return s1

def get_many_groups_total_dict(queries, sp):
	res = get_one_group_total_dict(sp[0], queries[0][0], queries[0][1], sp[1], sp[2])
	for q in queries[1:]:
		res = join_dicts(res, get_one_group_total_dict(sp[0], q[0], q[1], sp[1], sp[2]))
	return res


def reduce_manygroups_dict(x, y):
	return dict( (k, [ join_dicts(v[i], y[k][i]) for i in xrange(len(v))] ) for k,v in x.iteritems() )

def reduce_manygroups2d_dict_individual(xarray, yarray):
	return [ [ join_dicts(xarray[j][i], yarray[j][i]) for i in xrange(len(xarray[j])) ] for j in xrange(len(xarray)) ]

def get_many_groups2d_total_dict(data, sp):
	# return [ [get_one_group_total_dict(sp[0], q[0], q[1], sp[1], sp[2]) for q in queries] for queries in data]
	return [ get_many_groups_total_dict(queries, sp) for queries in data]

def corr_dicts(a, b):
    commonkeys = [ k for k in a if k in b ]
    return np.corrcoef(np.array([ a[k] for k in commonkeys ]), np.array([ b[k] for k in commonkeys ]))[0][1]

def avg_intensity_correlation(images, peak_intensities):
	'''Correlation between peak intensities and images intensities'''
	if len(images) != len(peak_intensities):
		# print "Length mismatch"
		# print "%s" % peak_intensities
		# print "%s" % images
		return 0
	image_intensities =np.array([ np.sum(img.values()) for img in images ])
	res = 1-np.linalg.norm(abs( peak_intensities/np.linalg.norm(peak_intensities) - image_intensities/np.linalg.norm(image_intensities)))
	if np.isnan(res):
		return 0
	else:
		return res

def avg_dict_correlation(images):
	'''Average correlation between the first, monoisotopic image and all other images'''
	corrs = []
	for i in xrange(1, len(images)):
		commonkeys = [ k for k in images[i] if k in images[0] ]
		if len(commonkeys) > 0:
			corrs.append(np.corrcoef(np.array([ images[i][k] for k in commonkeys ]), np.array([ images[0][k] for k in commonkeys ]))[0][1])
		else:
			corrs.append( 0 )
	res = np.mean(corrs)
	if np.isnan(res):
		return 0
	else:
		return res

def reduce_manygroups2d_dict(xarray, yarray):
	return [ join_dicts(xarray[i], yarray[i]) for i in xrange(len(xarray)) ]


''' Function for calculating a measure of image noise using level sets
# Inputs: image - numpy array of pixel intensities
         nlevels - number of levels to calculate over (note that we approximating a continuious distribution with a 'large enough' number of levels)
# Outputs: measure_value
 
This function calculates the number of connected regions above a threshold at an evenly spaced number of threshold
between the min and max values of the image.

There is some morphological operations to deal with orphaned pixels and heuristic parameters in the image processing.

# Usage	
img = misc.imread('/Users/palmer/Copy/ion_image.png').astype(float)
print measure_of_chaos(img,20)
 '''
def measure_of_chaos(im,nlevels,interp=True,q_val = 99.): 

	def clean_image(im_clean,interp):
		# Image properties
		notnull=im_clean>0
		im_size=np.shape(im_clean)
		if interp:
			try:
				# interpolate to replace missing data - not always present
				X,Y=np.meshgrid(np.arange(0,im_size[1]),np.arange(0,im_size[0]))
				f=interpolate.interp2d(X[notnull],Y[notnull],im_clean[notnull])
				im_clean=f(np.arange(0,im_size[1]),np.arange(0,im_size[0]))
			except:
				im_clean = np.zeros(np.shape(im_clean)) # if interp fails, bail out

		# hot spot removal (quantile threshold)
		im_q = np.percentile(im_clean[notnull],q_val)
		im_rep =  im_clean>im_q       
		im_clean[im_rep] = im_q
		im_clean = im_clean/im_q #scale max to 1
		return im_clean

	# don't process empty images
	if np.sum(im)==0:
		return np.nan,[],[],[]
	
	# Image in/preparation
	im=clean_image(im,interp)
	sum_notnull = np.sum(im > 0)
	if sum_notnull < 4:
		return np.nan,[],[],[]
	
	# calculate levels
	levels = np.linspace(0,1,nlevels) #np.amin(im), np.amax(im)

	# hardcoded morphology masks
	dilate_mask = [[0,1,0],[1,1,1],[0,1,0]]
	erode_mask = [[1,1,1],[1,1,1],[1,1,1]]
	label_mask = np.ones((3,3))
	# Go though levels and calculate number of objects
	num_objs = []
	
	for lev in levels:
		# Threshold at level
		bw = (im > lev)
		# Morphological operations
		bw=ndimage.morphology.binary_dilation(bw,structure=dilate_mask)
		bw=ndimage.morphology.binary_erosion(bw,structure=erode_mask)
		# Record objects at this level
		num_objs.append(ndimage.label(bw)[1])#second output is number of objects

	measure_value = float(np.sum(num_objs))/(sum_notnull*nlevels)
	return measure_value #,im,levels,num_objs


def measure_of_chaos_dict(d, nRows, nColumns, nlevels=20, interp=True, q_val = 99.):
	iSize = nRows*nColumns
	img = np.zeros((iSize,1))
	for i,v in d.iteritems():
		if i >= 0 and i < iSize:
			img[i] = v
	return measure_of_chaos(np.reshape(img,(nRows, nColumns)), nlevels, interp, q_val)
