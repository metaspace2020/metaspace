from pyopenms import FileHandler, MSExperiment

def read_ms1_experiment(filepath):
    source_experiment = MSExperiment()
    file_handler = FileHandler()
    file_handler.loadExperiment(filepath.encode(), source_experiment)

    ms1_experiment = MSExperiment()
    for spectrum in source_experiment:
        if spectrum.getMSLevel() == 1:
            ms1_experiment.addSpectrum(spectrum)
    return ms1_experiment
