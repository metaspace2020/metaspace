import pickle
from pathlib import Path
from typing import TypeVar, List
import copyreg

import pandas as pd
import msiwarp as mx


Self = TypeVar('Self')


def reduce_MxPeak(peak):
    return mx.peak, (peak.id, peak.mz, peak.height, peak.sigma)


def hydrate_MxNode(mz, slack, n_steps):
    return mx.initialize_nodes([mz], [slack], n_steps)[0]


def reduce_MxNode(node):
    return hydrate_MxNode, (node.mz, node.slack, len(node.mz_shifts) // 2)


copyreg.dispatch_table[mx.peak] = reduce_MxPeak
copyreg.dispatch_table[mx.node] = reduce_MxNode


class Transform:
    CACHE_FIELDS: List[str]
    _cache_prefix: str

    def fit(self: Self, X: pd.DataFrame) -> Self:
        raise NotImplementedError('Transform.fit')

    def predict(self, X: pd.DataFrame) -> pd.DataFrame:
        raise NotImplementedError('Transform.predict')

    def save_debug(self, spectra_df: pd.DataFrame, path_prefix: str):
        pass

    def save_cache(self):
        if not self.CACHE_FIELDS:
            raise NotImplementedError('Transform.save_cache')
        pickle.dump(
            {key: getattr(self, key) for key in self.CACHE_FIELDS},
            Path(f'{self._cache_prefix}_coef.pickle').open('wb'),
        )

    def load_cache(self, cache_prefix):
        self._cache_prefix = cache_prefix
        cache_obj = pickle.load(Path(f'{cache_prefix}_coef.pickle').open('rb'))
        for k, v in cache_obj.items():
            setattr(self, k, v)
