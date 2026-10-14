"""Ontology term store for metadata schema v2. Rows are written only by
scripts/import_ontology_terms.py through the functions below, never by hand.

OBO files are read with a small streaming parser rather than a full ontology library: the import
only needs id, name, synonyms, is_a and is_obsolete, and NCBITaxon is a 1.6 GB file that no
in-memory parser fits into a normal host. Two passes over the file on disk keep peak memory at the
size of the is_a graph plus the reachable id set (about 1 GB for NCBITaxon).
"""

import json
import logging
import os
import re
import shutil
import tempfile
import urllib.request
from collections import defaultdict
from itertools import islice
from pathlib import Path
from typing import Dict, Iterable, Iterator, List

from sm.engine.db import DB, transaction_context

logger = logging.getLogger('engine')

OBO_LIBRARY_URL = 'http://purl.obolibrary.org/obo/'

# LinkML slot -> ontology root(s) to import, each with its OBO library file name or full URL.
# ontology_slots.json is GENERATED from graphql's metadataSchemas/ontology_slots.json by
# `yarn gen-ontology-slots` (CI fails when stale) so the imported subtrees and the suggestion
# scope cannot drift apart. Never edit the copy here.
SLOTS_FILE = Path(__file__).with_name('ontology_slots.json')
SLOT_ONTOLOGY_ROOTS: Dict[str, List[Dict[str, str]]] = json.loads(SLOTS_FILE.read_text())

UPSERT_SQL = (
    'INSERT INTO ontology_term (curie, label, synonyms, ontology, subtree, obsolete) '
    'VALUES %s '
    'ON CONFLICT (curie, subtree) DO UPDATE SET '
    '  label = EXCLUDED.label, synonyms = EXCLUDED.synonyms, '
    '  ontology = EXCLUDED.ontology, obsolete = false'
)

_downloaded_files: Dict[str, str] = {}


def _obo_path(obo_file: str) -> str:
    """A local path for `obo_file`: the file itself if it exists (tests), otherwise a download of
    the URL, or of the OBO library file of that name, once per process (roots share ms.obo)."""
    if os.path.exists(obo_file):
        return obo_file
    if obo_file not in _downloaded_files:
        url = obo_file if obo_file.startswith('http') else OBO_LIBRARY_URL + obo_file
        logger.info(f'Downloading {url}')
        descriptor, path = tempfile.mkstemp(suffix='.obo')
        with os.fdopen(descriptor, 'wb') as out, urllib.request.urlopen(url) as resp:
            shutil.copyfileobj(resp, out, length=1 << 20)
        _downloaded_files[obo_file] = path
        logger.info(f'Downloaded {obo_file}: {os.path.getsize(path) >> 20} MB')
    return _downloaded_files[obo_file]


def clear_ontology_cache():
    """Delete the OBO files downloaded by this process."""
    for path in _downloaded_files.values():
        os.remove(path)
    _downloaded_files.clear()


_QUOTED_RE = re.compile(r'^"((?:[^"\\]|\\.)*)"')
_UNESCAPE_RE = re.compile(r'\\(.)')
# EFO's OBO export writes its ids as "efo:EFO_0000399"; the schema (and every other ontology here)
# uses the standard CURIE "EFO:0000399". Normalise that style so roots and is_a links line up.
_PREFIXED_ID_RE = re.compile(r'^[A-Za-z]+:([A-Za-z]+)_([A-Za-z0-9]+)$')


def _normalize_curie(value: str) -> str:
    return _PREFIXED_ID_RE.sub(r'\1:\2', value.strip())


def _unescape(value: str) -> str:
    return _UNESCAPE_RE.sub(r'\1', value.strip())


def _read_terms(path: str) -> Iterator[Dict]:
    """Stream the [Term] stanzas of an OBO file as {id, name, synonyms, is_a, obsolete}."""
    term = None
    with open(path, encoding='utf-8') as obo:
        for line in obo:
            line = line.rstrip('\r\n')
            if line.startswith('['):
                if term:
                    yield term
                term = (
                    {'id': None, 'name': None, 'synonyms': [], 'is_a': [], 'obsolete': False}
                    if line == '[Term]'
                    else None
                )
                continue
            if term is None or not line or line.startswith('!'):
                continue
            tag, sep, value = line.partition(':')
            if not sep:
                continue
            if tag == 'id':
                term['id'] = _normalize_curie(value)
            elif tag == 'name':
                term['name'] = _unescape(value)
            elif tag == 'is_a':
                # "is_a: MS:1000031 {qualifiers} ! instrument model"
                term['is_a'].append(_normalize_curie(value.split('!')[0].split('{')[0]))
            elif tag == 'synonym':
                match = _QUOTED_RE.match(value.strip())
                if match:
                    term['synonyms'].append(_unescape(match.group(1)))
            elif tag == 'is_obsolete':
                term['obsolete'] = value.strip().lower() == 'true'
    if term:
        yield term


def walk_subtree(root: str, obo_file: str) -> Iterable[Dict]:
    """Yield {curie, label, synonyms} for every non-obsolete term below `root` via is_a,
    excluding the root itself. Pass 1 builds the is_a graph, pass 2 streams the reachable terms."""
    path = _obo_path(obo_file)
    children = defaultdict(list)
    for term in _read_terms(path):
        for parent in term['is_a']:
            children[parent].append(term['id'])

    reachable = set()
    stack = [root]
    while stack:
        for child in children.get(stack.pop(), ()):
            if child not in reachable:
                reachable.add(child)
                stack.append(child)
    reachable.discard(root)
    del children

    for term in _read_terms(path):
        if term['id'] in reachable and not term['obsolete'] and term['name']:
            synonyms = sorted({syn for syn in term['synonyms'] if syn})
            yield {'curie': term['id'], 'label': term['name'], 'synonyms': synonyms}


def _batched(items: Iterable, size: int) -> Iterator[List]:
    iterator = iter(items)
    batch = list(islice(iterator, size))
    while batch:
        yield batch
        batch = list(islice(iterator, size))


def import_subtree(ontology: str, root: str, obo_file: str, batch_size: int = 10000) -> int:
    """Import (or refresh) one subtree. Not incremental: the whole subtree is flagged obsolete,
    then every term still reachable is upserted with obsolete = false, so terms that disappeared
    from the ontology stay in the table (a CURIE a dataset references never dangles). Runs in one
    transaction: a failed or empty walk rolls back and leaves the table untouched."""
    _obo_path(obo_file)  # download before opening the transaction below
    n_terms = 0
    with transaction_context():
        db = DB()
        db.alter('UPDATE ontology_term SET obsolete = true WHERE subtree = %s', params=(root,))
        for batch in _batched(walk_subtree(root, obo_file), batch_size):
            rows = [(t['curie'], t['label'], t['synonyms'], ontology, root, False) for t in batch]
            db.alter_many(UPSERT_SQL, rows=rows)
            n_terms += len(batch)
            logger.info(f'Upserted {n_terms} terms under {root} ({ontology}) so far')
        if n_terms == 0:
            raise ValueError(
                f'Walk of {root} ({ontology}) returned zero terms - refusing to mark the whole '
                f'subtree obsolete; this is most likely a fetch failure'
            )
    return n_terms
