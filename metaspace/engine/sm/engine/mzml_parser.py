from sm.engine.mzml_reading import read_ms1_experiment

class MzMLParser(object):
    def __init__(self, filename):
        self.experiment = read_ms1_experiment(filename)
        self.coordinates = [(i, 1, 1) for i in range(1, self.experiment.size() + 1)]

    def getspectrum(self, idx):
        return self.experiment[idx].get_peaks()
