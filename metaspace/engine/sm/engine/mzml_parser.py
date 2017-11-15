from pyopenms import FileHandler, MSExperiment


class MzMLParser(object):
    def __init__(self, filename):
        self.experiment = MSExperiment()
        file_handler = FileHandler()
        file_handler.loadExperiment(filename.encode(), self.experiment)

        self.coordinates = [(i, 1, 1) for i in range(1, self.experiment.size() + 1)]

    def getspectrum(self, idx):
        return self.experiment[idx].get_peaks()
