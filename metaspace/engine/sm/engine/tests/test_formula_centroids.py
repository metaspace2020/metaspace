import pandas as pd
from pytest import raises

from sm.engine.formula_centroids import FormulaCentroids


def create_formula_centroids(rows1, rows2):
    return FormulaCentroids(formulas_df=(pd.DataFrame(rows1, columns=['formula_i', 'formula'])
                                         .set_index('formula_i')),
                            centroids_df=(pd.DataFrame(rows2, columns=['formula_i', 'peak_i', 'mz', 'int'])
                                          .set_index('formula_i')))


def test_add_non_overlap():
    f_centr = create_formula_centroids([(0, 'f1a1')], [(0, 0, 10, 100), (0, 1, 20, 100)])
    formula_centroids_other = create_formula_centroids([(0, 'f2a2',)], [(0, 0, 30, 100), (0, 1, 40, 100)])

    f_centr += formula_centroids_other

    assert f_centr.formulas_df.index.name == f_centr.centroids_df.index.name == 'formula_i'

    assert f_centr.formulas_df.values.tolist() == [['f1a1'], ['f2a2']]
    assert f_centr.centroids_df.values.tolist() == [[0, 10, 100], [1, 20, 100], [0, 30, 100], [1, 40, 100]]


def test_add_overlap_exception():
    formula_centroids = create_formula_centroids([('f1', 'a1'), ('f1', 'a2')], [(10, 100), (20, 100)])
    formula_centroids_other = create_formula_centroids([('f1', 'a2')], [(20, 100)])

    with raises(AssertionError):
        formula_centroids += formula_centroids_other


def test_centroids_subset():
    formula_centroids = create_formula_centroids([('f1', 'a1'), ('f1', 'a2')], [(10, 100), (20, 100)])

    centroids_subset = formula_centroids.centroids_subset(formulas=[('f1', 'a2')])

    assert centroids_subset.values.tolist() == [[20, 100]]


def test_add_index_valid():
    formula_centroids = FormulaCentroids(formulas_df=pd.DataFrame([('f1', 'a1')],
                                                              index=pd.Index([5], name='formula_i'),
                                                              columns=['formula']),
                                     centroids_df=pd.DataFrame([(10, 10), (20, 100)],
                                                           index=pd.Index([5]*2, name='formula_i'),
                                                           columns=['mz', 'int']))
    formula_centroids_other = FormulaCentroids(formulas_df=pd.DataFrame([('f1', 'a2')],
                                                                    index=pd.Index([10], name='formula_i'),
                                                                    columns=['formula']),
                                           centroids_df=pd.DataFrame([(15, 10), (25, 100)],
                                                                 index=pd.Index([10]*2, name='formula_i'),
                                                                 columns=['mz', 'int']))

    formula_centroids += formula_centroids_other

    assert formula_centroids.formulas_df.index.values.tolist() == [5, 6]
    assert formula_centroids.centroids_df.index.values.tolist() == [5, 5, 6, 6]

