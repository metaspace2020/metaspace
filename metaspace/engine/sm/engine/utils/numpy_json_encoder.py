import json
import numpy as np


class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.number):
            return obj.item()
        elif isinstance(obj, np.ndarray):
            return obj.tolist()

        return json.JSONEncoder.default(self, obj)


def numpy_json_dumps(obj):
    return json.dumps(obj, cls=NumpyEncoder)
