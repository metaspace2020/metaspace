"""Minimal typed access to the metadata_v2 document, mirroring the slice of
metaspace_metadata's LinkML schema needed by the engine (currently just the acquisition
instrument model CURIE, for CURIE-aware instrument resolution in dataset.py). Kept deliberately
small rather than modeling the whole schema - widen as more of metadata_v2 is consumed here.
Field names mirror graphql's src/modules/dataset/projection.ts (OntologyTermValue/ReconciledValue/
AcquisitionInfo/MetadataV2Document/MetadataV2Envelope).
"""

from typing import Optional

from pydantic import BaseModel


class OntologyTermValue(BaseModel):
    value_ontology_id: Optional[str] = None
    value_label: Optional[str] = None
    value_free_text: Optional[str] = None
    curation_state: Optional[str] = None


class ReconciledValue(BaseModel):
    user_value: OntologyTermValue


class AcquisitionInfo(BaseModel):
    instrument_model: Optional[ReconciledValue] = None


class MetadataV2Document(BaseModel):
    acquisition: Optional[AcquisitionInfo] = None


class MetadataV2Envelope(BaseModel):
    document: Optional[MetadataV2Document] = None


def get_instrument_model_curie(metadata_v2: Optional[dict]) -> Optional[str]:
    """Extract acquisition.instrument_model's resolved ontology CURIE from a metadata_v2 document,
    or None if metadata_v2 is absent or the field is a free-text/pending-curation value."""
    if not metadata_v2:
        return None
    envelope = MetadataV2Envelope.model_validate(metadata_v2)
    acquisition = envelope.document.acquisition if envelope.document else None
    if acquisition is None or acquisition.instrument_model is None:
        return None
    return acquisition.instrument_model.user_value.value_ontology_id
