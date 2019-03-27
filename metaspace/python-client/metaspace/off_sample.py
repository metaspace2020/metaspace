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
    # image_predictions = []
    # for chunk in make_chunk_gen(images, chunk_size=32):
    #     logger.info('Classifying {} images'.format(len(chunk)))
    #     base64_images = []
    #     for img in chunk:
    #         if img.ndim > 2:
    #             img = img[:,:,0]
    #         pil_img = Image.fromarray(img)
    #         base64_images.append(encode_image_as_base64(pil_img))
    #
    #     images_doc = base64_images_to_doc(base64_images)
    #     pred_doc = call_api('/predict', doc=images_doc)
    #     image_predictions.extend(pred_doc['predictions'])
    # return image_predictions

    def numpy_to_pil(img):
        if img.ndim > 2:
            img = img[:,:,0]
        return Image.fromarray(img)

    return classify_images(images, numpy_to_pil)
