"""Access to the slice of the metadata_v2 document the engine consumes (currently only the
acquisition instrument-model CURIE). Key names mirror graphql's src/modules/dataset/projection.ts.
"""

from typing import Optional


def get_instrument_model_curie(metadata_v2: Optional[dict]) -> Optional[str]:
    """Return document.acquisition.instrument_model.user_value.value_ontology_id, or None when
    metadata_v2 is absent, malformed, or the value is free text."""
    node = metadata_v2
    for key in ('document', 'acquisition', 'instrument_model', 'user_value'):
        node = node.get(key) if isinstance(node, dict) else None
    if not isinstance(node, dict):
        return None
    curie = node.get('value_ontology_id')
    return curie if isinstance(curie, str) and curie else None
