import numpy as np


class MassSpectrum:
    # a class that describes a single mass spectrum
    def __init__(self):
        self._mzs = []
        self._intensities = []
        self._centroids = []
        self.centroids_intensity = []

    ## Private basic spectrum I/O
    def __add_mzs(self, mzs):
        self._mzs = mzs

    def __add_intensities(self, intensities):
        self._intensities = intensities

    def __get_mzs(self):
        return np.asarray(self._mzs)

    def __get_intensities(self):
        return np.asarray(self._intensities)

    def __get_mzs_centroids(self):
        return np.asarray(self._centroids)

    def __get_intensities_centroids(self):
        return np.asarray(self.centroids_intensity)

    def __add_centroids_mzs(self, mz_list):
        self._centroids = mz_list

    def __add_centroids_intensities(self, intensity_list):
        self.centroids_intensity = intensity_list

    ## Public methods
    def add_spectrum(self, mzs, intensities):
        if len(mzs) != len(intensities):
            raise IOError("mz/intensities vector different lengths")
        self.__add_mzs(mzs)
        self.__add_intensities(intensities)

    def add_centroids(self, mz_list, intensity_list):
        if len(mz_list) != len(intensity_list):
            raise IOError("mz/intensities vector different lengths")
        self.__add_centroids_mzs(mz_list)
        self.__add_centroids_intensities(intensity_list)

    def get_spectrum(self, source='profile'):
        if source == 'profile':
            mzs = self.__get_mzs()
            intensities = self.__get_intensities()
        elif source == 'centroids':
            mzs = self.__get_mzs_centroids()
            intensities = self.__get_intensities_centroids()
        else:
            raise IOError('spectrum source should be profile or centroids')
        return mzs, intensities

# for compatibility with andy-d-palmer/pyIMS
mass_spectrum = MassSpectrum

class MSn_spectrum(MassSpectrum):
    def __init__(self):
        self.ms_transitions = []
        self.ms_level = 1

    def add_transition(self, transitions):
        # transitions is a list of ms fragmentation acceptance windows
        self.transitions = transitions
        self.mz_level = len(self.transitions) + 1
