import numpy as np
import cStringIO
import png

def write_image(img, fp=None, size=None, colormap=None, format="png"):
	'''Save image in a given format and return the StringIO object'''
	if not fp:
		fp = cStringIO.StringIO()
	if not size:
		size = (len(img[0]), len(img))
	if colormap:
		w = png.Writer(size=size, bitdepth=8, palette=colormap)
	else:
		w = png.Writer(size=size, bitdepth=8)
	w.write(fp, img)
	# png_img = png.from_array(img, mode='RGB', info={"height":size[1], "width":size[0]})
	# png_img.save(fp)
	return fp

def make_image_dict(nRows, nColumns, valdict, offset=0):
	'''Create image from a dictionary of its nonzero pixels'''
	iSize = nRows*nColumns
	img = np.zeros((iSize,1))
	for k,v in valdict.iteritems():
		if k+offset < iSize:
			img[k+offset] = v
		else:
			print("[WARNING]: Index %d out of bounds for %dx%d m/z image!" % (k+offset, nRows, nColumns))
	img=np.reshape(img,(nRows, nColumns))
	return img

def make_image_arrays(nRows, nColumns, indices, values, offset=0):
	'''Create image from two arrays of its nonzero pixels (array of indices and array of values)'''
	iSize = nRows*nColumns
	img = np.zeros((iSize,1))
	for n in xrange(len(indices)):
		if indices[n]+offset < iSize and indices[n]+offset >= 0:
			img[indices[n]+offset] = values[n]
		else:
			print("[WARNING]: Index %d out of bounds for %dx%d m/z image!" % (indices[n]+offset, nRows, nColumns))
	img=np.reshape(img,(nRows, nColumns))
	return img
