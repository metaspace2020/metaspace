import json
import numpy as np


class NumpyEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, np.number):
            return o.item()
        elif isinstance(o, np.ndarray):
            return o.tolist()

        return json.JSONEncoder.default(self, o)


def numpy_json_dumps(obj):
    """JSON encoder that supports Numpy scalars and arrays"""
    return json.dumps(obj, cls=NumpyEncoder)
