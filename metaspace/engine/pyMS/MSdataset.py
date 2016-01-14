import numpy as np
from pyMS.mass_spectrum import mass_spectrum

class MSdataset():
    def __init__(self):  
        self.index_list = []
        self.mz_min=float("inf")
        self.mz_max=0
        self.spectra = []#dict of mass_spectrum objects
    def data_summary(self):
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
    def _del_(self):
        # clean up afterwards
        self.hdf.close()
    def get_spectrum(self,index):
        return self.spectra[index]
    def add_spectrum(self,profile_mzs=[],profile_intensities=[],centroids_mz=[],centroid_intensity=[],index=[]):
        if profile_mzs==[] & centroids_mz==[]:
            raise ValueError('one of profile or centroids mzs should be non-empty')  
        new_spectrum=mass_spectrum()
        new_spectrum.add_spectrum(profile_mzs,profile_intensities)
        new_spectrum.add_centroids(centroids_mz,centroid_intensity)
        if index==[]:
            self.index_list.append(max(self.index_list)+1)
        self.spectra.append(new_spectrum)
        
        

