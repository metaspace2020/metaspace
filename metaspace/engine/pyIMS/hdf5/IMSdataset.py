import h5py
import numpy as np
from pyMS.mass_spectrum import mass_spectrum
from pyIMS.ion_datacube import ion_datacube

class IMSdataset():
    def __init__(self,filename):
    	self.file_type='MSIhdf5'
        # parse file to get required parameters
        # can use thin hdf5 wrapper for getting data from file
        self.filename = filename
        self.file_type = 'IMS.hdf5'
        self.hdf = h5py.File(filename,'r')       #Readonly, file must exist
        self.index_list = map(int,self.hdf['/spectral_data'].keys())
        self.coords = self.get_coords()
	self.mz_min=float("inf")
	self.mz_max=0
        # check if all spectra are the same length
        spec_length = np.zeros(len(self.index_list))
        for ii in self.index_list:
            this_spectrum = self.get_spectrum(ii)
            tmp_shape = this_spectrum.mzs.shape
            spec_length[ii]=tmp_shape[0]
	    if this_spectrum.mzs[0]<self.mz_min:
		self.mz_min=this_spectrum.mzs[0]
	    if this_spectrum.mzs[-1]>self.mz_max:
		self.mz_max=this_spectrum.mzs[-1]
        if np.all(spec_length==spec_length[1]):
            self.consistent_mz = True
        else:
            self.consistent_mz = False
        print self.consistent_mz
        print 'file loaded'
    def _del_(self):
        # clean up afterwards
        self.hdf.close()
    def get_coords(self):
        coords = np.zeros((len(self.index_list),3))
        for k in self.index_list:
            coords[k,:] = self.hdf['/spectral_data/'+str(k)+'/coordinates/']
        return coords
    def get_ion_image(self,mz_list,tol_list,tol_type='mz',return_method='sum'):
        # todo - use tol_type and ensure tol is a vector
        # define mz ranges once
        mz_list_upper = np.zeros(np.shape(mz_list))
        mz_list_lower = np.zeros(np.shape(mz_list))
        for mm in range(0,len(mz_list)):
            mz_list_upper[mm] = mz_list[mm]+tol_list[mm]
            mz_list_lower[mm] = mz_list[mm]-tol_list[mm]
        # sum intensities
        # todo - implement alternative return_method (e.g. max, median sum)
        xic_array = np.zeros((len(self.index_list),len(mz_list)))
        if self.consistent_mz==True:
            print "consistent"
            this_spectrum = self.get_spectrum(0)
	    # precalculate which mzs should be made
            mz_index = np.zeros((len(this_spectrum.mzs),len(mz_list)),dtype=bool)
            for mm in range(0,len(mz_list)):
                mz_index[:,mm] = (this_spectrum.mzs<mz_list_upper[mm]) & (this_spectrum.mzs>mz_list_lower[mm])
            for ii in self.index_list:
                this_spectrum = self.get_spectrum(ii)
                for mm in range(0,len(mz_list)):
                   xic_array[ii,mm] = sum(this_spectrum.intensities[mz_index[:,mm]])
        else:
            print "inconsistent"
            for ii in self.index_list:
                this_spectrum = self.get_spectrum(ii)
                for mm in range(0,len(mz_list)):
                    mz_index = (this_spectrum.mzs<mz_list_upper[mm]) & (this_spectrum.mzs>mz_list_lower[mm])            
                    xic_array[ii,mm] = sum(this_spectrum.intensities[mz_index])
        data_out = ion_datacube()
        data_out.add_coords(self.coords)
        data_out.add_xic(xic_array,mz_list,tol_list)
        return data_out
    def get_spectrum(self,index,datatype='profile'):
        this_spectrum = mass_spectrum()
        tmp_str='/spectral_data/%d/' %(index) 
	if datatype == 'profile':
	        this_spectrum.add_spectrum(self.hdf[tmp_str+'mzs/'],self.hdf[tmp_str+'/intensities/'])
	elif datatype=='centroid':
	        this_spectrum.add_centroids(self.hdf[tmp_str+'centroid_mzs/'],self.hdf[tmp_str+'/centroid_intensities/'])
	elif datatype == 'all':
		if self.hdf[tmp_str+'mzs/']:
			this_spectrum.add_spectrum(self.hdf[tmp_str+'mzs/'],self.hdf[tmp_str+'/intensities/'])
		if self.hdf[tmp_str+'centroid_mzs/']:
	        	this_spectrum.add_centroids(self.hdf[tmp_str+'centroid_mzs/'],self.hdf[tmp_str+'/centroid_intensities/'])
		
        return this_spectrum
    def coord_to_index(self, coord):
        index = 0
        return index
