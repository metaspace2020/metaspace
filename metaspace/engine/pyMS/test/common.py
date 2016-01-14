import json
import os
import random
import unittest

import numpy

__author__ = 'Dominik Fay'


class MSTestCase(unittest.TestCase):
    """Makes some sample mass spectra available for testing as :code:`self.valid_spectrum_data`and
    :code:`self.invalid_spectrum_data`.

    Each of these is a list of 2-tuples where the first element is a list of m/z values and the second element a
    list of intensity values. These should be a (in)valid input to any function that takes a mass spectrum. Use
    :code:`to_array_tuples` to convert them to numpy arrays.
    """

    def setUp(self):
        self.valid_spectrum_data = [
            ([1, 2], [1, 1]),
            ([1, 2, 3, 4], [4, 8, 2, 1]),
            ([4.7, 4.9, 11.8, 56.4], [462.12, 1172.45, 13.123, 123.45]),
            (sorted([10000 * random.random() for _ in range(15)]), [5000 * random.random() for _ in range(
                15)]),
            (sorted([10000 * random.random() for _ in range(2000)]), [5000 * random.random() for _ in range(
                2000)])
        ]
        self.invalid_spectrum_data = [
            ([], []),
            ([1], []),
            (None, None),
            (None, [1, 2, 3]),
            (range(2000), range(1999)),
            ([10000 * random.random() for _ in range(2000)], [5000 * random.random() for _ in range(1999)])
        ]

    def to_array_tuples(self, tuples):
        """Create a generator that yields tuples where each tuple contains the lists converted to numpy arrays.

        :rtype : generator
        :param tuples: an iterable of tuples, each of length two. Each element in the tuple must be in a format that is
        acceptable by :code:`numpy.array`
        :return: generator yielding tuples, the elements of each tuple casted to a numpy array
        :raises ValueError: when the tuple which is currently iterated over is not of length 2
        """
        for t in tuples:
            if len(t) != 2:
                raise ValueError("%s does not have length 2" % t)
            yield (numpy.array(t[0]), numpy.array(t[1]))


class SimpleMock(object):
    """
    Class for easily mocking objects by specifying its attributes as a dict. Each call to __getattribute__ is
    forwarded to the dict passed in the constructor.
    """
    def __init__(self, attrs):
        self._attrs = attrs

    def __getattribute__(self, name):
        return object.__getattribute__(self, '_attrs')[name]


def resolve_test_resource(module, name, resource_id):
    fn = "%(module)s_%(name)s_refdata_%(id)s.json" % {"module": module, "name": name, "id": resource_id}
    abs_path_to_resource_dir = os.path.abspath(os.path.dirname(__file__))
    return os.path.join(abs_path_to_resource_dir, fn)


def load_json_file(fn):
    with open(fn, 'r') as fp:
        return json.load(fp)


if __name__ == '__main__':
    unittest.main()
