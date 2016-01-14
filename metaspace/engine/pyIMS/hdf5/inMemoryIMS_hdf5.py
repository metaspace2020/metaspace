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
    def __init__(self,filename,min_mz=0.,max_mz=np.inf,min_int=0.,index_range=[]):
        file_size = os.path.getsize(filename)
        self.load_file(filename,min_mz,max_mz,index_range=index_range)
        
    def load_file(self,filename,min_mz=0,max_mz=np.inf,min_int=0,index_range=[]):
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
            if len(mzs) != len(counts):
                raise TypeError('length of mzs ({}) not equal to counts ({})'.format(len(mzs),len(counts)))
            # Enforce data limits
            mz_range = [m>min_mz and m<max_mz for m in mzs]  
            counts=counts[np.where(mz_range)] #using mz_range as a boolean index failed - just returned the first value over and over
            mzs=mzs[np.where(mz_range)]
            ct_gt0 = counts>min_int
            mzs = mzs[np.where(ct_gt0)]
            counts=counts[np.where(ct_gt0)]

            # append ever-growing lists (should probably be preallocated or piped to disk and re-loaded)
            for a in list(mzs):
                self.mz_list.append(a)
            for c in list(counts):
                self.count_list.append(c)
            for ix in ii*np.ones((len(mzs),),dtype =int):
                self.idx_list.append(ix)
            
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
