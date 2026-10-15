import pytest

from sm.engine.db import DB
from sm.engine.ontology_term import clear_ontology_cache, import_subtree, walk_subtree

ROOT = 'TEST:0001'

OBO_V1 = """format-version: 1.2
ontology: test

[Term]
id: TEST:0001
name: root term

[Term]
id: TEST:0002
name: child a
synonym: "alpha" EXACT []
synonym: "first child" RELATED []
is_a: TEST:0001

[Term]
id: TEST:0003
name: grandchild
is_a: TEST:0002

[Term]
id: TEST:0004
name: retired child
is_obsolete: true
is_a: TEST:0001

[Term]
id: tst:TEST_0006
name: prefixed child
is_a: tst:TEST_0001

[Term]
id: TEST:0005
name: childless root
"""

# TEST:0003 no longer exists in the second release of the ontology
OBO_V2 = OBO_V1.replace(
    """[Term]
id: TEST:0003
name: grandchild
is_a: TEST:0002

""",
    '',
)


@pytest.fixture()
def obo_files(tmp_path):
    v1 = tmp_path / 'v1.obo'
    v2 = tmp_path / 'v2.obo'
    v1.write_text(OBO_V1)
    v2.write_text(OBO_V2)
    yield str(v1), str(v2)
    clear_ontology_cache()


def _stored_terms():
    rows = DB().select(
        'SELECT curie, label, synonyms, ontology, subtree, obsolete FROM ontology_term '
        'ORDER BY curie'
    )
    return [tuple(row) for row in rows]


def test_walk_subtree_skips_root_and_obsolete_terms(obo_files):
    v1, _ = obo_files

    terms = sorted(walk_subtree(ROOT, v1), key=lambda t: t['curie'])

    assert terms == [
        {'curie': 'TEST:0002', 'label': 'child a', 'synonyms': ['alpha', 'first child']},
        {'curie': 'TEST:0003', 'label': 'grandchild', 'synonyms': []},
        {
            'curie': 'TEST:0006',
            'label': 'prefixed child',
            'synonyms': [],
        },  # EFO-style id normalised
    ]


def test_import_subtree_upserts_terms(test_db, obo_files):
    v1, _ = obo_files

    n_terms = import_subtree('test', ROOT, v1)

    assert n_terms == 3
    assert _stored_terms() == [
        ('TEST:0002', 'child a', ['alpha', 'first child'], 'test', ROOT, False),
        ('TEST:0003', 'grandchild', [], 'test', ROOT, False),
        ('TEST:0006', 'prefixed child', [], 'test', ROOT, False),
    ]


def test_import_subtree_marks_vanished_terms_obsolete_instead_of_deleting(test_db, obo_files):
    v1, v2 = obo_files
    import_subtree('test', ROOT, v1)

    n_terms = import_subtree('test', ROOT, v2)

    assert n_terms == 2
    assert _stored_terms() == [
        ('TEST:0002', 'child a', ['alpha', 'first child'], 'test', ROOT, False),
        ('TEST:0003', 'grandchild', [], 'test', ROOT, True),
        ('TEST:0006', 'prefixed child', [], 'test', ROOT, False),
    ]


def test_import_subtree_refuses_an_empty_walk_and_keeps_existing_rows(test_db, obo_files):
    v1, _ = obo_files
    import_subtree('test', ROOT, v1)
    before = _stored_terms()

    with pytest.raises(Exception):  # a missing file is fetched from the OBO library and 404s
        import_subtree('test', ROOT, v1.replace('v1.obo', 'missing.obo'))
    with pytest.raises(ValueError, match='zero terms'):
        import_subtree('test', 'TEST:0005', v1)  # a real root with no descendants

    assert _stored_terms() == before


def test_module_imports_without_ontology_slots_json(tmp_path):
    """Lithops ships modules to workers as .py files only (include_modules), so importing
    ontology_term there — pulled in transitively by unpickling any engine function — must not
    require ontology_slots.json to sit next to the module file."""
    import importlib.util
    import shutil

    import sm.engine.ontology_term as ontology_term

    module_copy = tmp_path / 'ontology_term.py'  # the .py is shipped, the .json is not
    shutil.copy(ontology_term.__file__, module_copy)

    spec = importlib.util.spec_from_file_location('ontology_term_worker_copy', str(module_copy))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # must not raise FileNotFoundError

    # The data itself still only exists on the daemon side
    with pytest.raises(FileNotFoundError):
        module.get_slot_ontology_roots()


def test_get_slot_ontology_roots_reads_the_real_file():
    from sm.engine.ontology_term import get_slot_ontology_roots

    roots = get_slot_ontology_roots()
    assert 'instrument_model' in roots
    assert all('root' in binding for binding in roots['instrument_model'])
