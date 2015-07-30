import numpy as np

from math import log
from scipy import ndimage, misc, ndarray, interpolate 


def measure_of_chaos(im,nlevels,interp=True,q_val = 99.): 
	''' Function for calculating a measure of image noise using level sets
	:param image: numpy array of pixel intensities
	:param nlevels: number of levels to calculate over (note that we approximating a continuious distribution with a 'large enough' number of levels)
	
	Outputs: measure_value
	 
	This function calculates the number of connected regions above a threshold at an evenly spaced number of threshold
	between the min and max values of the image.

	There is some morphological operations to deal with orphaned pixels and heuristic parameters in the image processing.

	# Usage	
	img = misc.imread('/Users/palmer/Copy/ion_image.png').astype(float)
	print measure_of_chaos(img,20)
	'''

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
	'''Applies :code:`measure_of_chaos` to an image given as a dictionary.'''
	iSize = nRows*nColumns
	img = np.zeros((iSize,1))
	for i,v in d.iteritems():
		if i >= 0 and i < iSize:
			img[i] = v
	return measure_of_chaos(np.reshape(img,(nRows, nColumns)), nlevels, interp, q_val)

