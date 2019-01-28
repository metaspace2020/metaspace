import pandas as pd
from pytest import raises

from sm.engine.ion_centroids import IonCentroids


def create_ion_centroids(rows1, rows2):
    return IonCentroids(ions_df=pd.DataFrame(rows1,
                                             index=pd.Index(range(len(rows1)), name='ion_i'),
                                             columns=['formula', 'adduct']),
                        centroids_df=pd.DataFrame(rows2,
                                                  index=pd.Index(range(len(rows2)), name='ion_i'),
                                                  columns=['mz', 'int']))


def test_add_non_overlap():
    ion_centroids = create_ion_centroids([('f1', 'a1')], [(10, 100)])
    ion_centroids_other = create_ion_centroids([('f2', 'a2')], [(20, 100)])

    ion_centroids += ion_centroids_other

    assert ion_centroids.ions_df.values.tolist() == [['f1', 'a1'], ['f2', 'a2']]
    assert ion_centroids.centroids_df.values.tolist() == [[10, 100], [20, 100]]


def test_add_overlap_exception():
    ion_centroids = create_ion_centroids([('f1', 'a1'), ('f1', 'a2')], [(10, 100), (20, 100)])
    ion_centroids_other = create_ion_centroids([('f1', 'a2')], [(20, 100)])

    with raises(AssertionError):
        ion_centroids += ion_centroids_other


def test_centroids_subset():
    ion_centroids = create_ion_centroids([('f1', 'a1'), ('f1', 'a2')], [(10, 100), (20, 100)])

    centroids_subset = ion_centroids.centroids_subset(ions=[('f1', 'a2')])

    assert centroids_subset.values.tolist() == [[20, 100]]


def test_add_index_valid():
    ion_centroids = IonCentroids(ions_df=pd.DataFrame([('f1', 'a1')],
                                                      index=pd.Index([5], name='ion_i'),
                                                      columns=['formula', 'adduct']),
                                 centroids_df=pd.DataFrame([(10, 10), (20, 100)],
                                                           index=pd.Index([5]*2, name='ion_i'),
                                                           columns=['mz', 'int']))
    ion_centroids_other = IonCentroids(ions_df=pd.DataFrame([('f1', 'a2')],
                                                            index=pd.Index([10], name='ion_i'),
                                                            columns=['formula', 'adduct']),
                                       centroids_df=pd.DataFrame([(15, 10), (25, 100)],
                                                                 index=pd.Index([10]*2, name='ion_i'),
                                                                 columns=['mz', 'int']))

    ion_centroids += ion_centroids_other

    assert ion_centroids.ions_df.index.values.tolist() == [5, 6]
    assert ion_centroids.centroids_df.index.values.tolist() == [5, 5, 6, 6]


def test_ions_subset():
    ion_centroids = create_ion_centroids([('f1', 'a1'), ('f1', 'a2')], [(10, 100), (20, 100)])

    ions_subset = ion_centroids.ions_subset(adducts=['a2'])

    assert ions_subset == [('f1', 'a2')]
