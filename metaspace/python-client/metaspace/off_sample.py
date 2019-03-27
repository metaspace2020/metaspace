from PIL import Image
import logging

from sm.engine.off_sample_wrapper import classify_images

logger = logging.getLogger('off-sample')


def classify(images):
    """ Classify ion images

    Args
    ----
    images: List[numpy.ndarray]

    Returns
    -------
    List[dict]
        {'label': 'on'|'off', 'prob': float}
    """
    def numpy_to_pil(img):
        if img.ndim > 2:
            img = img[:,:,0]
        return Image.fromarray(img)

    return classify_images(images, numpy_to_pil)
