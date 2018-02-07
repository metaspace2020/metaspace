from pyopenms import FileHandler, MSExperiment

def read_ms1_experiment(filepath):
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
