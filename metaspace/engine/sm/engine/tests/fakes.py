"""Test doubles shared by the browser-array, .ibd and ion-image unit tests."""
import re
from io import BytesIO
from unittest.mock import MagicMock

import numpy as np


def parse_byte_range(range_header: str):
    first, last = map(int, re.match(r'bytes=(\d+)-(\d+)', range_header).groups())
    return first, last


def make_fake_s3(files):
    """S3 client over ``{key: bytes}`` honouring ``Range``; records ``request_sizes`` and
    ``ranges`` (inclusive byte bounds) per get_object call."""
    s3 = MagicMock()
    s3.request_sizes = []
    s3.ranges = []

    def get_object(Bucket, Key, Range=None):  # pylint: disable=invalid-name, unused-argument
        data = files[Key]
        if Range:
            first, last = parse_byte_range(Range)
            s3.ranges.append((first, last))
            data = data[first : last + 1]
        s3.request_sizes.append(len(data))
        return {'Body': BytesIO(data)}

    s3.get_object.side_effect = get_object
    s3.head_object.side_effect = lambda Bucket, Key: {'ContentLength': len(files[Key])}
    return s3


class InMemoryArrays:
    """BrowserArrays stand-in over in-memory m/z-sorted arrays; yields windows shuffled."""

    def __init__(self, mzs, ints, sp_idxs, seed=0):
        self.mzs, self.ints, self.sp_idxs, self.seed = mzs, ints, sp_idxs, seed

    def iter_mz_windows(
        self, mz_lo, mz_hi, chunk_bytes, **_kwargs
    ):  # pylint: disable=unused-argument
        for i in np.random.default_rng(self.seed).permutation(len(mz_lo)):
            left = np.searchsorted(self.mzs, mz_lo[i], side='left')
            right = np.searchsorted(self.mzs, mz_hi[i], side='right')
            yield int(i), self.mzs[left:right], self.ints[left:right], self.sp_idxs[left:right]
