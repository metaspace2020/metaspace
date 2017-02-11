from sm.engine.util import SMConfig
from sm.engine.msm_basic.formula_imager_segm import compute_sf_images
from sm.engine.msm_basic.formula_img_validator import sf_image_metrics, sf_image_metrics_est_fdr
from sm.engine.search_algorithm import SearchAlgorithm
from sm.engine.png_generator import PngGenerator, ImageStoreServiceWrapper

import logging
logger = logging.getLogger('sm-engine')


class MSMBasicSearch(SearchAlgorithm):

    def __init__(self, sc, ds, formulas, fdr, ds_config):
        super(MSMBasicSearch, self).__init__(sc, ds, formulas, fdr, ds_config)
        self.metrics = ['chaos', 'spatial', 'spectral']
        self.max_fdr = 0.5

    def _get_post_images(self):
        png_generator = PngGenerator(self.ds.coords, greyscale=True)
        img_store = ImageStoreServiceWrapper(self.sm_config['services']['upload_url'])

        def _post_images(imgs):
            imgs += [None] * (4 - len(imgs))

            # ion image
            fp = png_generator.generate_png(sum(filter(lambda i: i is not None, imgs)).toarray())
            ion_image_url = img_store.post_image(fp)

            # isotopic images
            iso_image_urls = []
            for img in imgs:
                if img is None:
                    iso_image_urls.append(None)
                else:
                    fp = png_generator.generate_png(img.toarray())
                    iso_image_urls.append(img_store.post_image(fp))
            return {
                'ion_image_url': ion_image_url,
                'iso_image_urls': iso_image_urls
            }
        return _post_images

    def _post_images_to_image_store(self, ion_images):
        logger.info('Posting iso images to {}'.format(self.sm_config['services']['upload_url']))
        post_images = self._get_post_images()
        return dict(ion_images.mapValues(lambda imgs: post_images(imgs)).collect())
        # return dict(map(lambda (_, imgs): post_images(imgs), ion_images.collect()))

    def search(self):
        """ Search for molecules in the dataset

        Returns
        -------
        : tuple
            (ion metrics DataFrame, ion image urls dict)
        """
        logger.info('Running molecule search')
        ion_images = compute_sf_images(self.sc, self.ds, self.formulas.get_sf_peak_df(),
                                      self.ds_config['image_generation']['ppm'])
        all_sf_metrics_df = self.calc_metrics(ion_images)
        sf_metrics_fdr_df = self.estimate_fdr(all_sf_metrics_df)
        sf_metrics_fdr_df = self.filter_sf_metrics(sf_metrics_fdr_df)
        ion_images = self.filter_sf_images(ion_images, sf_metrics_fdr_df)
        ion_img_urls = self._post_images_to_image_store(ion_images)

        return sf_metrics_fdr_df, ion_img_urls

    def calc_metrics(self, sf_images):
        all_sf_metrics_df = sf_image_metrics(sf_images, self.sc, self.formulas, self.ds, self.ds_config)
        return all_sf_metrics_df

    def estimate_fdr(self, all_sf_metrics_df):
        sf_metrics_fdr_df = sf_image_metrics_est_fdr(all_sf_metrics_df, self.formulas, self.fdr)
        return sf_metrics_fdr_df

    def filter_sf_metrics(self, sf_metrics_df):
        return sf_metrics_df[sf_metrics_df.fdr <= self.max_fdr]
