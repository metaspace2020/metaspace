import numpy as np
class mass_spectrum():
    # a class that describes a single mass spectrum
    def __init__(self):
        self.mzs = []
        self.intensities = []
        self.centroids = [] 
    def add_intensities(self,intensities):
        self.intensities = intensities
    def add_mzs(self,mzs):
        self.mzs = mzs
    def get_mzs(self):
	return np.asarray(self.mzs)
    def get_intensities(self):
	return np.asarray(self.intensities)
    def add_centroids(self,mz_list,intensity_list):
	self.centroids = mz_list
	self.centroids_intensity = intensity_list





