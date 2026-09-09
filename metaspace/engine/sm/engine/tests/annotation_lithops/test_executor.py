import importlib.abc
import importlib.util
import sys
from pathlib import Path

import pytest
from lithops.libs import imp as lithops_imp

from sm.engine.annotation_lithops.executor import ensure_include_modules_findable_by_lithops

PKG_NAME = 'fake_editable_pkg'


class _EditableFinder(importlib.abc.MetaPathFinder):
    """Mimics the PEP 660 editable-install finder that setuptools generates for `pip install -e .`:
    the package is importable through an import hook only and has no `sys.path` entry."""

    def __init__(self, mapping):
        self.mapping = mapping

    def find_spec(self, fullname, path=None, target=None):  # pylint: disable=unused-argument
        pkg_dir = self.mapping.get(fullname)
        if pkg_dir is None:
            return None
        return importlib.util.spec_from_file_location(
            fullname, pkg_dir / '__init__.py', submodule_search_locations=[str(pkg_dir)]
        )


@pytest.fixture
def editable_package(tmp_path, monkeypatch):
    pkg_dir = tmp_path / PKG_NAME
    pkg_dir.mkdir()
    (pkg_dir / '__init__.py').write_text('')
    monkeypatch.setattr(sys, 'meta_path', [_EditableFinder({PKG_NAME: pkg_dir}), *sys.meta_path])
    monkeypatch.setattr(sys, 'path', list(sys.path))
    monkeypatch.delitem(sys.modules, PKG_NAME, raising=False)
    return pkg_dir


@pytest.mark.usefixtures('editable_package')
def test_editable_package_is_invisible_to_lithops_module_finder():
    # Documents the Lithops behaviour being worked around: importable, but not via a sys.path scan
    assert importlib.util.find_spec(PKG_NAME) is not None
    with pytest.raises(ImportError):
        lithops_imp.find_module(PKG_NAME)


def test_ensure_include_modules_makes_editable_package_findable(editable_package):
    ensure_include_modules_findable_by_lithops([PKG_NAME])

    assert str(editable_package.parent) in sys.path
    _, found_path, _ = lithops_imp.find_module(PKG_NAME)
    assert Path(found_path) == editable_package


def test_ensure_include_modules_is_idempotent(editable_package):
    ensure_include_modules_findable_by_lithops([PKG_NAME])
    ensure_include_modules_findable_by_lithops([PKG_NAME, f'{PKG_NAME}.submodule'])

    assert sys.path.count(str(editable_package.parent)) == 1


def test_ensure_include_modules_leaves_sys_path_alone_for_findable_or_missing_modules(monkeypatch):
    monkeypatch.setattr(sys, 'path', list(sys.path))
    before = list(sys.path)

    # json: stdlib package already on sys.path; os.path: dotted name whose root is a plain module
    ensure_include_modules_findable_by_lithops(['json', 'os.path', 'no_such_module_xyz'])

    assert sys.path == before
