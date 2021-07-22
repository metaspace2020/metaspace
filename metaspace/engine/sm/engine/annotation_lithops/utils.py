from __future__ import annotations

import json
import logging
from base64 import urlsafe_b64encode
from hashlib import blake2b

logger = logging.getLogger('annotation-pipeline')


def jsonhash(obj) -> str:
    """
    Calculates a hash for a JSON-stringifiable object. Intended for compacting large sets of
    parameters into a simple key that can be used to distinctly identify a cache entry.

    The output is collision-resistant, but shouldn't be assumed to be cryptographically secure.
    In most cases a motivated adversary could figure out the original object contents easily, as
    there's no hidden key and it's unlikely there will be much variety in the objects hashed.
    """
    json_val = json.dumps(obj, sort_keys=True)
    hash_val = blake2b(json_val.encode(), digest_size=12).digest()
    return str(urlsafe_b64encode(hash_val), 'utf-8')
