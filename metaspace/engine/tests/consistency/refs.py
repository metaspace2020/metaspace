import json
import os
import platform
from importlib import metadata
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict

import numpy as np

REF_DIR = Path(__file__).parent / 'refs'
REGEN_COMMAND = 'python -m tests.consistency.tools.regen_refs'
_PACKAGES = {
    'numpy': 'numpy',
    'pandas': 'pandas',
    'scipy': 'scipy',
    'catboost': 'catboost',
    'cpyMSpec': 'cpyMSpec',
    'cpyMSpec_0_3_5': 'cpyMSpec-0-3-5',
    'cpyImagingMSpec': 'cpyImagingMSpec',
    'pyimzML': 'pyimzML',
    'pyarrow': 'pyarrow',
}
_STACK_KEYS = ['python'] + list(_PACKAGES)


def provenance() -> Dict[str, str]:
    result = {'git_sha': os.environ.get('CONSISTENCY_GIT_SHA', 'unknown')}
    result['python'] = platform.python_version()
    for key, dist in _PACKAGES.items():
        try:
            result[key] = metadata.version(dist)
        except metadata.PackageNotFoundError:
            result[key] = 'missing'
    result['date_utc'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    return result


def _jsonable(obj):
    if isinstance(obj, np.ndarray):
        return [_jsonable(v) for v in obj.tolist()]
    if isinstance(obj, np.generic):
        return obj.item()
    if isinstance(obj, dict):
        return {str(k): _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(v) for v in obj]
    return obj


def _path(name: str) -> Path:
    return Path(REF_DIR) / f'{name}.json'


def regen_mode() -> bool:
    return os.environ.get('CONSISTENCY_REGEN') == '1'


def write_ref(name: str, data: Dict) -> None:
    path = _path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = {'provenance': provenance(), 'data': _jsonable(data)}
    path.write_text(json.dumps(doc, sort_keys=True, indent=1) + '\n')


def load_ref(name: str) -> Dict:
    path = _path(name)
    if not path.exists():
        raise AssertionError(f'missing reference {name}; run: {REGEN_COMMAND} ({path})')
    return json.loads(path.read_text())


def _provenance_diff(ref_prov: Dict[str, str]) -> str:
    current = provenance()
    diffs = [
        f'{key}: reference {ref_prov.get(key, "?")} vs current {current.get(key, "?")}'
        for key in _STACK_KEYS
        if ref_prov.get(key) != current.get(key)
    ]
    header = f'reference generated at git {ref_prov.get("git_sha", "?")} on {ref_prov.get("date_utc", "?")}'
    if not diffs:
        return f'{header}; stack identical to current stack'
    return f'{header}; STACK DIFFERS: ' + '; '.join(diffs)


def check_ref(name: str, actual: Dict, compare: Callable[[Dict, Dict], None]) -> None:
    if regen_mode():
        write_ref(name, actual)
        return
    ref = load_ref(name)
    try:
        compare(actual, ref['data'])
    except AssertionError as exc:
        raise AssertionError(
            f'{exc}\nreference {name}: {_provenance_diff(ref["provenance"])}'
        ) from exc
