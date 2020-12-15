import pandas as pd
from pytest import raises

from sm.engine.annotation.formula_centroids import FormulaCentroids


def create_formula_centroids(rows1, rows2):
    return FormulaCentroids(
        formulas_df=(pd.DataFrame(rows1, columns=['formula_i', 'formula']).set_index('formula_i')),
        centroids_df=(
            pd.DataFrame(rows2, columns=['formula_i', 'peak_i', 'mz', 'int']).set_index('formula_i')
        ),
    )


def test_add_non_overlap():
    f_centr = create_formula_centroids([(0, 'f1a1')], [(0, 0, 10, 100), (0, 1, 20, 100)])
    formula_centroids_other = create_formula_centroids(
        [(0, 'f2a2')], [(0, 0, 30, 100), (0, 1, 40, 100)]
    )

    f_centr += formula_centroids_other

    assert f_centr.formulas_df.index.name == f_centr.centroids_df().index.name == 'formula_i'

    assert f_centr.formulas_df.values.tolist() == [['f1a1'], ['f2a2']]
    assert f_centr.centroids_df().values.tolist() == [
        [0, 10, 100],
        [1, 20, 100],
        [0, 30, 100],
        [1, 40, 100],
    ]

    assert f_centr.formulas_df.index.values.tolist() == [0, 1]
    assert f_centr.centroids_df().index.values.tolist() == [0, 0, 1, 1]


def test_add_overlap_exception():
    formula_centroids = create_formula_centroids(
        [(0, 'f1a1'), (1, 'f2a2')],
        [(0, 0, 10, 100), (0, 1, 15, 100), (1, 0, 20, 100), (1, 1, 25, 100)],
    )
    formula_centroids_other = create_formula_centroids(
        [(0, 'f2a2')], [(0, 0, 20, 100), (0, 1, 25, 100)]
    )

    with raises(AssertionError):
        formula_centroids += formula_centroids_other
