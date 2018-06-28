from sm.engine.util import SMConfig


class SearchAlgorithm(object):

    def __init__(self, sc, ds, ds_reader, mol_db, fdr, ds_config):
        self._sc = sc
        self._ds = ds
        self._ds_reader = ds_reader
        self._mol_db = mol_db
        self._fdr = fdr
        self.ds_config = ds_config
        self.metrics = None
        self.sm_config = SMConfig.get_conf()

    def search(self):
        pass

    def calc_metrics(self, sf_images, ion_centroids_df):
        pass

    def estimate_fdr(self, all_sf_metrics_df):
        pass

    def filter_sf_metrics(self, sf_metrics_df):
        return sf_metrics_df[sf_metrics_df.msm > 0]

    def filter_sf_images(self, sf_images, sf_metrics_df):
        def has_metrics(item):
            ion = item[0]
            return ion in sf_metrics_df.index
        return sf_images.filter(has_metrics)
