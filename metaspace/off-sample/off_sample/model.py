from fastai.basic_data import DatasetType
from fastai.basic_train import load_learner
from fastai.vision.data import ImageList


class OffSamplePredictModel:
    def __init__(self, model_path):
        self.learn = load_learner('.', model_path)
        self.target_class_idx = self.learn.data.classes.index('off')

    def predict(self, paths):
        item_list = ImageList(paths)
        self.learn.data.add_test(item_list)

        pred_probs, _ = self.learn.get_preds(DatasetType.Test)
        pred_probs = pred_probs.numpy()
        preds = pred_probs.argmax(axis=1)
        labels = [self.learn.data.classes[label_idx] for label_idx in preds]

        return pred_probs[:, self.target_class_idx], labels
