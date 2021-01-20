class MzMLParser:
    def __init__(self, filename):
        self.experiment = self.read_ms1_experiment(filename)
        self.coordinates = [(i, 1, 1) for i in range(1, self.experiment.size() + 1)]

    @staticmethod
    def read_ms1_experiment(filepath):
        # pylint: disable=import-outside-toplevel,no-name-in-module,import-error
        from pyopenms import FileHandler, MSExperiment

        source_experiment = MSExperiment()
        file_handler = FileHandler()
        # bytes is required by `loadExperiment()` called below
        typed_fp = filepath if isinstance(filepath, bytes) else filepath.encode()
        file_handler.loadExperiment(typed_fp, source_experiment)

        ms1_experiment = MSExperiment()
        for spectrum in source_experiment:
            if spectrum.getMSLevel() == 1:
                ms1_experiment.addSpectrum(spectrum)
        return ms1_experiment

    def getspectrum(self, idx):
        return self.experiment[idx].get_peaks()
