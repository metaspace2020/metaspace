import os
import h5py
import numpy as np
import bisect
import sys
import matplotlib.pyplot as plt

# import our MS libraries
sys.path.append('/Users/palmer/Documents/python_codebase/')
from pyMS.mass_spectrum import mass_spectrum
from pyIMS.ion_datacube import ion_datacube
class inMemoryIMS_hdf5():
    def __init__(self,filename,min_mz=0,max_mz=np.inf,index_range=[]):
        file_size = os.path.getsize(filename)
        self.load_file(filename,min_mz,max_mz)
        
    def load_file(self,filename,min_mz=0,max_mz=np.inf,min_int=0.):
        # parse file to get required parameters
        # can use thin hdf5 wrapper for getting data from file
        self.file_dir, self.filename = file_type=os.path.splitext(filename)
        self.file_type = file_type
        self.hdf = h5py.File(filename,'r')   #Readonly, file must exist
	if index_range == []:
        	self.index_list = map(int,self.hdf['/spectral_data'].keys())
	else: 
		self.index_list = index_range
        self.coords = self.get_coords()
        # load data into memory
        self.mz_list = []
        self.count_list = []
        self.idx_list = []
        for ii in self.index_list:
            # load spectrum, keep values gt0 (shouldn't be here anyway)
            this_spectrum = self.get_spectrum(ii)
            mzs,counts = this_spectrum.get_spectrum(source='centroids')
	    counts=counts[mzs>min_mz]
	    counts=counts[mzs<max_mz]
	    mzs=mzs[mzs>min_mz]
	    mzs=mzs[mzs<max_mz]
            ct_gt0 = counts>min_int
            mzs = mzs[ct_gt0]
            counts=counts[ct_gt0]
	    idx = ii*np.ones((len(mzs),),dtype =int)
            # append ever-growing lists (should probably be preallocated or piped to disk and re-loaded)
	    mz_merged=[]
	    counts_merged=[]
	    idx_merged=[]
            while ~isempty(mzs) & ~isempty(mz_list):
		# clean up if one list is empty
		if isempty(mzs):
			while ~isempty(mz_list):
				mz_merged.append(mz_list.pop())
		if isempty(mz_list):
			while ~isempty(mzs):
				mz_merged.append(mzs.pop())
		if mzs[-1]>mz_list[-1]:
			mz_merged.append(mzs.pop())
			counts_merged.append(counts.pop())
			idx_merged.append(idx.pop())
		else:
			mz_merged.append(mz_list.pop())
			counts_merged.append(count_list.pop())
			idx_merged.append(idx_list.pop())
		mz_merged.reverse
		count_merged.reverse()
		idx_merged.reverse()
		mz_list = mz_merged
		count_list=count_merged
		idx_list=idx_merged
            for c in list(counts):
                self.count_list.append(c)
            for ix in ii*np.ones((len(mzs),),dtype =int):
                self.idx_list.append(ix)
            #if ii > 200:
            #    break
        # to np arrays
	print 'loaded spectra'
        self.mz_list = np.asarray(self.mz_list)
        self.count_list = np.asarray(self.count_list)
        self.idx_list = np.asarray(self.idx_list)
        # sort by mz for fast image formation
        mz_order = np.argsort(self.mz_list)
        self.mz_list = self.mz_list[mz_order]
        self.count_list = self.count_list[mz_order]
        self.idx_list = self.idx_list[mz_order]
        print 'file loaded'
    def get_coords(self):
        coords = np.zeros((len(self.index_list),3))
        for k in self.index_list:
            coords[k,:] = self.hdf['/spectral_data/'+str(k)+'/coordinates/']
        return coords
    def get_spectrum(self,index):
        this_spectrum = mass_spectrum()
        tmp_str='/spectral_data/%d/' %(index) 
        this_spectrum.add_centroids(self.hdf[tmp_str+'/centroid_mzs/'],self.hdf[tmp_str+'/centroid_intensities/'])
        return this_spectrum
    def get_ion_image(self,mzs,tols,tol_type='ppm'):
        tols = tols*mzs/1e6 # to m/z
        data_out = ion_datacube()
        data_out.add_coords(self.coords)
        for mz,tol in zip(mzs,tols):
            mz_upper = mz + tol
            mz_lower = mz - tol
            idx_left = bisect.bisect_left(self.mz_list,mz_lower)
            idx_right = bisect.bisect_right(self.mz_list,mz_upper)
            # slice list for code clarity
            count_vect = np.concatenate((np.asarray([0]),self.count_list[idx_left:idx_right],np.asarray([0])))
            idx_vect = np.concatenate((np.asarray([0]),self.idx_list[idx_left:idx_right],np.asarray([max(self.index_list)])))
            # bin vectors
            ion_vect=np.bincount(idx_vect,count_vect)
            data_out.add_xic(ion_vect,[mz],[tol])
        return data_out
