from __future__ import annotations

import re
import sys
from datetime import (
    date,
    datetime,
    time
)
from decimal import Decimal
from enum import Enum
from typing import (
    Any,
    ClassVar,
    Literal,
    Optional,
    Union
)

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    RootModel,
    SerializationInfo,
    SerializerFunctionWrapHandler,
    field_validator,
    model_serializer
)


metamodel_version = "1.11.0"
version = "0.2.0"


class ConfiguredBaseModel(BaseModel):
    model_config = ConfigDict(
        serialize_by_alias = True,
        validate_by_name = True,
        validate_assignment = True,
        validate_default = True,
        extra = "forbid",
        arbitrary_types_allowed = True,
        use_enum_values = True,
        strict = False,
    )





class LinkMLMeta(RootModel):
    root: dict[str, Any] = {}
    model_config = ConfigDict(frozen=True)

    def __getattr__(self, key:str):
        return getattr(self.root, key)

    def __getitem__(self, key:str):
        return self.root[key]

    def __setitem__(self, key:str, value):
        self.root[key] = value

    def __contains__(self, key:str) -> bool:
        return key in self.root


linkml_meta = LinkMLMeta({'default_prefix': 'metaspace',
     'default_range': 'string',
     'description': 'A LinkML schema for METASPACE dataset-submission metadata, '
                    'covering the Imaging MS (ims.json) submission path. It binds '
                    'the currently free-text sample and acquisition fields to '
                    'controlled vocabularies where a reasonable ontology exists, '
                    'while keeping a structural free-text escape hatch on every '
                    'ontology-bound field. Processing parameters (DSConfig: '
                    'adducts, charge, isocalc_sigma, instrument, ppm, n_peaks, '
                    '...) are deliberately NOT modeled here. See README.md for '
                    'per-slot ontology justifications and the OLS lookups '
                    'performed. Phase 1: self-contained; not integrated into the '
                    'live service.',
     'id': 'https://metaspace2020.org/schema/metaspace_submission',
     'imports': ['linkml:types'],
     'license': 'https://www.apache.org/licenses/LICENSE-2.0',
     'name': 'metaspace_submission',
     'prefixes': {'CHEBI': {'prefix_prefix': 'CHEBI',
                            'prefix_reference': 'http://purl.obolibrary.org/obo/CHEBI_'},
                  'CLO': {'prefix_prefix': 'CLO',
                          'prefix_reference': 'http://purl.obolibrary.org/obo/CLO_'},
                  'EFO': {'prefix_prefix': 'EFO',
                          'prefix_reference': 'http://www.ebi.ac.uk/efo/EFO_'},
                  'MONDO': {'prefix_prefix': 'MONDO',
                            'prefix_reference': 'http://purl.obolibrary.org/obo/MONDO_'},
                  'MS': {'prefix_prefix': 'MS',
                         'prefix_reference': 'http://purl.obolibrary.org/obo/MS_'},
                  'NCBITaxon': {'prefix_prefix': 'NCBITaxon',
                                'prefix_reference': 'http://purl.obolibrary.org/obo/NCBITaxon_'},
                  'OBI': {'prefix_prefix': 'OBI',
                          'prefix_reference': 'http://purl.obolibrary.org/obo/OBI_'},
                  'PATO': {'prefix_prefix': 'PATO',
                           'prefix_reference': 'http://purl.obolibrary.org/obo/PATO_'},
                  'PO': {'prefix_prefix': 'PO',
                         'prefix_reference': 'http://purl.obolibrary.org/obo/PO_'},
                  'UBERON': {'prefix_prefix': 'UBERON',
                             'prefix_reference': 'http://purl.obolibrary.org/obo/UBERON_'},
                  'linkml': {'prefix_prefix': 'linkml',
                             'prefix_reference': 'https://w3id.org/linkml/'},
                  'metaspace': {'prefix_prefix': 'metaspace',
                                'prefix_reference': 'https://metaspace2020.org/schema/metaspace_submission/'},
                  'obo': {'prefix_prefix': 'obo',
                          'prefix_reference': 'http://purl.obolibrary.org/obo/'},
                  'rdfs': {'prefix_prefix': 'rdfs',
                           'prefix_reference': 'http://www.w3.org/2000/01/rdf-schema#'},
                  'skos': {'prefix_prefix': 'skos',
                           'prefix_reference': 'http://www.w3.org/2004/02/skos/core#'},
                  'xsd': {'prefix_prefix': 'xsd',
                          'prefix_reference': 'http://www.w3.org/2001/XMLSchema#'}},
     'source_file': 'schema/metaspace_submission.yaml',
     'title': 'METASPACE Submission Metadata (Imaging MS)'} )

class CurationState(str, Enum):
    """
    Resolution state of an OntologyTermValue.
    """
    controlled = "controlled"
    """
    Resolved to a controlled ontology term.
    """
    pending_curation = "pending_curation"
    """
    Free text awaiting curator review.
    """
    free_text_accepted = "free_text_accepted"
    """
    Free text reviewed and accepted; no ontology term applies.
    """


class ReconciliationState(str, Enum):
    """
    Result of cross-checking a user value against the imzML file value.
    """
    not_checked = "not_checked"
    """
    No cross-check has been run (default; the Phase 1 state).
    """
    matched = "matched"
    """
    User value agreed with the file-observed value.
    """
    mismatched = "mismatched"
    """
    User value disagreed; surfaced to the user, not auto-applied.
    """
    file_value_absent = "file_value_absent"
    """
    The file carried no comparable value.
    """


class SampleType(str, Enum):
    """
    Biological sample kind; selects the Sample subclass.
    """
    tissue = "tissue"
    cell_culture = "cell_culture"
    plant = "plant"
    environmental = "environmental"


class DataTypeEnum(str, Enum):
    """
    Acquisition modality. Only Imaging MS is modeled this pass; LC-MS is a later overlay.
    """
    Imaging_MS = "Imaging MS"
    """
    Imaging mass spectrometry (the ims.json submission path).
    """


class PolarityEnum(str, Enum):
    """
    Ion mode, with PSI-MS scan-polarity meaning mappings.
    """
    Positive = "Positive"
    Negative = "Negative"


class SexEnum(str, Enum):
    """
    Biological sex, with PATO meanings where applicable.
    """
    female = "female"
    male = "male"
    mixed = "mixed"
    """
    Mixed-sex population.
    """
    unknown = "unknown"
    """
    Not recorded / not determined.
    """


class HealthStatusEnum(str, Enum):
    """
    Case/control health state. EFO checked first; its terms are study-design classes, so a static enum is used with an EFO meaning on `control` only.
    """
    control = "control"
    disease = "disease"
    """
    Diseased/affected sample (see `disease` for the specific term).
    """
    disease_model = "disease_model"
    """
    Experimental disease model (e.g. transgenic).
    """
    treated = "treated"
    """
    Received an intervention/treatment.
    """
    other = "other"
    """
    Escape value; describe in protocol_description.
    """


class OrganismEnum(str):
    """
    Any NCBITaxon organism (cellular organisms subtree).
    """
    pass


class AnatomyUberonEnum(str):
    """
    Any Uberon anatomical entity.
    """
    pass


class AnatomyPlantEnum(str):
    """
    Any Plant Ontology plant anatomical entity (for PlantSample; not wired to a slot this pass).
    """
    pass


class DiseaseEnum(str):
    """
    Any MONDO disease.
    """
    pass


class DevelopmentalStageEnum(str):
    """
    Any EFO developmental stage.
    """
    pass


class CellLineEnum(str):
    """
    Any EFO cell line (cross-references Cellosaurus/CLO).
    """
    pass


class IonizationSourceEnum(str):
    """
    Any PSI-MS ionization type.
    """
    pass


class InstrumentModelEnum(str):
    """
    Any PSI-MS instrument model. Note bare analyzer types (Orbitrap/TOF/FT-ICR) are under PSI-MS mass analyzer type (MS:1000443), not here - see README.
    """
    pass


class ChebiCompoundEnum(str):
    """
    Any ChEBI chemical entity (for matrix and solvent compounds).
    """
    pass



class Dataset(ConfiguredBaseModel):
    """
    A single METASPACE submission: one biological Sample plus the AcquisitionInfo describing how it was measured. schema_version is stamped once at submission and never changed, so legacy free-text datasets can be harmonized later without special-casing.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://metaspace2020.org/schema/metaspace_submission',
         'slot_usage': {'acquisition': {'name': 'acquisition', 'required': True},
                        'sample': {'name': 'sample', 'required': True}},
         'tree_root': True})

    schema_version: str = Field(default="0.1.0", description="""Schema version, stamped once at submission and never changed.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['Dataset'],
         'ifabsent': 'string(0.1.0)'} })
    data_type: DataTypeEnum = Field(default=..., description="""Acquisition/analysis modality. This pass models Imaging MS only. Distinct from sample_type (which selects the biological Sample subclass).""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['Dataset']} })
    dataset_name: Optional[str] = Field(default=None, description="""Human-readable dataset name.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['Dataset']} })
    sample: Union[Sample,TissueSample,CellCultureSample,PlantSample,EnvironmentalSample] = Field(default=..., description="""The biological sample that was measured.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['Dataset']} })
    acquisition: AcquisitionInfo = Field(default=..., description="""How the sample was measured.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['Dataset']} })

    @field_validator('schema_version')
    def pattern_schema_version(cls, v):
        pattern=re.compile(r"^\d+\.\d+\.\d+$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.match(element):
                    err_msg = f"Invalid schema_version format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.match(v):
            err_msg = f"Invalid schema_version format: {v}"
            raise ValueError(err_msg)
        return v


class OntologyTermValue(ConfiguredBaseModel):
    """
    A value that is either resolved to a controlled ontology term or recorded as free text pending curator review. This is the reusable escape-hatch pattern: ontology-bound slots range over this class rather than a plain string, so the free-text fallback is structural, not bolted on. Which ontology `value_ontology_id` should be drawn from is attached per slot via LinkML `bindings` at RECOMMENDED obligation (so free text never blocks).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://metaspace2020.org/schema/metaspace_submission',
         'rules': [{'description': 'A controlled value must carry an ontology id; a '
                                   'free-text value must carry the free text.',
                    'postconditions': {'slot_conditions': {'value_ontology_id': {'name': 'value_ontology_id',
                                                                                 'required': True}}},
                    'preconditions': {'slot_conditions': {'curation_state': {'equals_string': 'controlled',
                                                                             'name': 'curation_state'}}}}]})

    value_ontology_id: Optional[str] = Field(default=None, description="""CURIE of the resolved controlled-vocabulary term, if any.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['OntologyTermValue']} })
    value_label: Optional[str] = Field(default=None, description="""Human-readable label of the resolved term, or the term as displayed.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['OntologyTermValue']} })
    value_free_text: Optional[str] = Field(default=None, description="""The submitter's original free text, retained whenever the value is not (or not yet) resolved to a controlled term.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['OntologyTermValue']} })
    curation_state: CurationState = Field(default=CurationState.pending_curation, description="""Whether this value is controlled, awaiting curation, or accepted as free text.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['OntologyTermValue'],
         'ifabsent': 'string(pending_curation)'} })


class ReconciledValue(ConfiguredBaseModel):
    """
    A user-submitted value that may optionally be cross-checked against the same fact as read from the imzML file itself. The file value NEVER overwrites the user's value; a mismatch is recorded for the user to resolve, not auto-applied. Distinct from OntologyTermValue, which is about resolving free text to a term, not cross-checking two independent sources. Concrete subclasses attach the recommended controlled vocabulary to the user value. Populating file_observed_value is Phase 2 integration work.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'abstract': True,
         'from_schema': 'https://metaspace2020.org/schema/metaspace_submission'})

    user_value: OntologyTermValue = Field(default=..., description="""The value the submitter provided, as an OntologyTermValue.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['ReconciledValue']} })
    file_observed_value: Optional[str] = Field(default=None, description="""The raw value pyimzml/ImzMLReader read from the imzML file's own cvParam metadata, if any. Populated in Phase 2; never overwrites user_value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['ReconciledValue']} })
    reconciliation_state: ReconciliationState = Field(default=ReconciliationState.not_checked, description="""Result of cross-checking user_value against file_observed_value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['ReconciledValue'],
         'ifabsent': 'string(not_checked)'} })


class PolarityValue(ReconciledValue):
    """
    Reconciled acquisition polarity (Positive / Negative).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://metaspace2020.org/schema/metaspace_submission',
         'slot_usage': {'user_value': {'bindings': [{'binds_value_of': 'value_ontology_id',
                                                     'description': 'value_ontology_id '
                                                                    'should be a '
                                                                    'PSI-MS '
                                                                    'scan-polarity '
                                                                    'term.',
                                                     'obligation_level': 'RECOMMENDED',
                                                     'range': 'PolarityEnum'}],
                                       'name': 'user_value'}}})

    user_value: OntologyTermValue = Field(default=..., description="""The value the submitter provided, as an OntologyTermValue.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be a PSI-MS '
                                      'scan-polarity term.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'PolarityEnum'}],
         'domain_of': ['ReconciledValue']} })
    file_observed_value: Optional[str] = Field(default=None, description="""The raw value pyimzml/ImzMLReader read from the imzML file's own cvParam metadata, if any. Populated in Phase 2; never overwrites user_value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['ReconciledValue']} })
    reconciliation_state: ReconciliationState = Field(default=ReconciliationState.not_checked, description="""Result of cross-checking user_value against file_observed_value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['ReconciledValue'],
         'ifabsent': 'string(not_checked)'} })


class IonizationSourceValue(ReconciledValue):
    """
    Reconciled ionization source (e.g. MALDI, ESI, DESI).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://metaspace2020.org/schema/metaspace_submission',
         'slot_usage': {'user_value': {'bindings': [{'binds_value_of': 'value_ontology_id',
                                                     'description': 'value_ontology_id '
                                                                    'should be under '
                                                                    'PSI-MS ionization '
                                                                    'type '
                                                                    '(MS:1000008).',
                                                     'obligation_level': 'RECOMMENDED',
                                                     'range': 'IonizationSourceEnum'}],
                                       'name': 'user_value'}}})

    user_value: OntologyTermValue = Field(default=..., description="""The value the submitter provided, as an OntologyTermValue.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be under PSI-MS '
                                      'ionization type (MS:1000008).',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'IonizationSourceEnum'}],
         'domain_of': ['ReconciledValue']} })
    file_observed_value: Optional[str] = Field(default=None, description="""The raw value pyimzml/ImzMLReader read from the imzML file's own cvParam metadata, if any. Populated in Phase 2; never overwrites user_value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['ReconciledValue']} })
    reconciliation_state: ReconciliationState = Field(default=ReconciliationState.not_checked, description="""Result of cross-checking user_value against file_observed_value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['ReconciledValue'],
         'ifabsent': 'string(not_checked)'} })


class InstrumentModelValue(ReconciledValue):
    """
    Reconciled instrument model (e.g. \"Q Exactive Plus\", \"timsTOF fleX\"). Maps from the current free-text MS_Analysis.Analyzer, whose only present validation is a substring allowlist in application code.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://metaspace2020.org/schema/metaspace_submission',
         'slot_usage': {'user_value': {'bindings': [{'binds_value_of': 'value_ontology_id',
                                                     'description': 'value_ontology_id '
                                                                    'should be under '
                                                                    'PSI-MS instrument '
                                                                    'model '
                                                                    '(MS:1000031); '
                                                                    'bare analyzer '
                                                                    'types '
                                                                    '(Orbitrap/TOF/FT-ICR) '
                                                                    'live under PSI-MS '
                                                                    'mass analyzer '
                                                                    'type (MS:1000443) '
                                                                    'instead - see '
                                                                    'README.',
                                                     'obligation_level': 'RECOMMENDED',
                                                     'range': 'InstrumentModelEnum'}],
                                       'name': 'user_value'}}})

    user_value: OntologyTermValue = Field(default=..., description="""The value the submitter provided, as an OntologyTermValue.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be under PSI-MS '
                                      'instrument model (MS:1000031); bare analyzer '
                                      'types (Orbitrap/TOF/FT-ICR) live under PSI-MS '
                                      'mass analyzer type (MS:1000443) instead - see '
                                      'README.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'InstrumentModelEnum'}],
         'domain_of': ['ReconciledValue']} })
    file_observed_value: Optional[str] = Field(default=None, description="""The raw value pyimzml/ImzMLReader read from the imzML file's own cvParam metadata, if any. Populated in Phase 2; never overwrites user_value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['ReconciledValue']} })
    reconciliation_state: ReconciliationState = Field(default=ReconciliationState.not_checked, description="""Result of cross-checking user_value against file_observed_value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['ReconciledValue'],
         'ifabsent': 'string(not_checked)'} })


class Sample(ConfiguredBaseModel):
    """
    Abstract base for a biological sample. sample_type is the discriminator selecting the concrete subclass. health_status / genetic_background / disease are the proposed decomposition of the current single free-text Sample_Information.Condition field (see README migration proposal).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'abstract': True,
         'from_schema': 'https://metaspace2020.org/schema/metaspace_submission'})

    sample_class: Literal["Sample"] = Field(default="Sample", description="""Names the concrete Sample subclass (TissueSample / CellCultureSample / PlantSample / EnvironmentalSample). Redundant with sample_type but required so polymorphic instances round-trip and validate against the right subclass.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'designates_type': True,
         'domain_of': ['Sample']} })
    organism: OntologyTermValue = Field(default=..., description="""Source organism. Maps from Sample_Information.Organism.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be an NCBITaxon term.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'OrganismEnum'}],
         'domain_of': ['Sample']} })
    sample_type: SampleType = Field(default=..., description="""Biological sample kind; discriminator selecting the Sample subclass. Genuinely internal/structural, so a static enum is correct here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['Sample']} })
    health_status: Optional[HealthStatusEnum] = Field(default=None, description="""Case/control/experimental health state. Part of the current free-text Condition field (see README migration proposal). EFO was checked first; its matching terms are study-DESIGN classes rather than per-sample state values, so a small static enum is used, mapping `control` to EFO where it fits. `other` is the escape value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })
    genetic_background: Optional[OntologyTermValue] = Field(default=None, description="""Strain / genotype / cultivar. Part of the current free-text Condition field. No single OLS ontology covers strain nomenclature well (MGI and Cellosaurus are external registries), so free text is expected here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })
    disease: Optional[OntologyTermValue] = Field(default=None, description="""Disease state, if any. Part of the current free-text Condition field. Bound to MONDO: EFO's disease branch is imported MONDO terms, so MONDO is the real source (see README EFO-vs-MONDO note).""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be a MONDO disease '
                                      'term.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'DiseaseEnum'}],
         'domain_of': ['Sample']} })
    protocol_description: Optional[str] = Field(default=None, description="""Always free text, never ontology-bound. Absorbs the current Additional_Information.Supplementary and Sample_Information .Sample_Growth_Conditions (treatment/intervention prose); deeper treatment modeling belongs to xstats, not here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })


class TissueSample(Sample):
    """
    A tissue sample. Imaging MS submissions today are implicitly tissue-oriented; this is the default concrete Sample.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://metaspace2020.org/schema/metaspace_submission'})

    anatomical_site_coarse: OntologyTermValue = Field(default=..., description="""Coarse organism part. Maps from Sample_Information.Organism_Part. Bound to Uberon for animal tissue; Plant Ontology is the source for PlantSample (see README).""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be an Uberon '
                                      'anatomical entity.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'AnatomyUberonEnum'}],
         'domain_of': ['TissueSample']} })
    anatomical_site_fine: Optional[OntologyTermValue] = Field(default=None, description="""Fine-grained anatomical location. No current equivalent. No general organism-agnostic atlas ontology fits, so free text is expected pending curation.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['TissueSample']} })
    sample_stabilisation: OntologyTermValue = Field(default=..., description="""Preservation/stabilisation method (maps from Sample_Preparation.Sample_Stabilisation; required today). OBI was checked; it has fixation-function and FFPE terms but no clean value branch covering fresh-frozen / cryopreserved / dried, so this is free-text-first with OBI ids where they exist. See README for the recommended value list.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['TissueSample']} })
    tissue_modification: OntologyTermValue = Field(default=..., description="""Specimen modification (maps from Sample_Preparation.Tissue_Modification; required today). Modeled separately from sample_stabilisation, not collapsed. OBI coverage for this is also thin; free-text-first.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['TissueSample']} })
    developmental_stage: Optional[OntologyTermValue] = Field(default=None, description="""Developmental / life stage. No current equivalent. Bound to EFO developmental stage (EFO:0000399, confirmed live), which has organism-specific subclasses.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be under EFO '
                                      'developmental stage.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'DevelopmentalStageEnum'}],
         'domain_of': ['TissueSample']} })
    sex: Optional[SexEnum] = Field(default=None, description="""Biological sex. No current equivalent. Static enum with PATO meanings (EFO reuses PATO:0000047 for the parent quality); `unknown`/`mixed` are the escape values.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['TissueSample']} })
    sample_class: Literal["TissueSample"] = Field(default="TissueSample", description="""Names the concrete Sample subclass (TissueSample / CellCultureSample / PlantSample / EnvironmentalSample). Redundant with sample_type but required so polymorphic instances round-trip and validate against the right subclass.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'designates_type': True,
         'domain_of': ['Sample']} })
    organism: OntologyTermValue = Field(default=..., description="""Source organism. Maps from Sample_Information.Organism.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be an NCBITaxon term.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'OrganismEnum'}],
         'domain_of': ['Sample']} })
    sample_type: SampleType = Field(default=..., description="""Biological sample kind; discriminator selecting the Sample subclass. Genuinely internal/structural, so a static enum is correct here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['Sample']} })
    health_status: Optional[HealthStatusEnum] = Field(default=None, description="""Case/control/experimental health state. Part of the current free-text Condition field (see README migration proposal). EFO was checked first; its matching terms are study-DESIGN classes rather than per-sample state values, so a small static enum is used, mapping `control` to EFO where it fits. `other` is the escape value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })
    genetic_background: Optional[OntologyTermValue] = Field(default=None, description="""Strain / genotype / cultivar. Part of the current free-text Condition field. No single OLS ontology covers strain nomenclature well (MGI and Cellosaurus are external registries), so free text is expected here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })
    disease: Optional[OntologyTermValue] = Field(default=None, description="""Disease state, if any. Part of the current free-text Condition field. Bound to MONDO: EFO's disease branch is imported MONDO terms, so MONDO is the real source (see README EFO-vs-MONDO note).""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be a MONDO disease '
                                      'term.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'DiseaseEnum'}],
         'domain_of': ['Sample']} })
    protocol_description: Optional[str] = Field(default=None, description="""Always free text, never ontology-bound. Absorbs the current Additional_Information.Supplementary and Sample_Information .Sample_Growth_Conditions (treatment/intervention prose); deeper treatment modeling belongs to xstats, not here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })


class CellCultureSample(Sample):
    """
    A cultured-cell sample. No equivalent in the current Imaging MS schema.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://metaspace2020.org/schema/metaspace_submission',
         'slot_usage': {'cell_line_id': {'name': 'cell_line_id', 'required': True}}})

    cell_line_id: OntologyTermValue = Field(default=..., description="""Cell line identity. No current equivalent (Imaging MS has no cell-culture branch today). Bound to EFO's cell line branch, which cross-references Cellosaurus/CLO. See README EFO-vs-Cellosaurus note.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be an EFO cell line '
                                      'term.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'CellLineEnum'}],
         'domain_of': ['CellCultureSample']} })
    passage_number: Optional[int] = Field(default=None, description="""Passage number of the cultured cells, if known.""", ge=0, json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'extension'}},
         'domain_of': ['CellCultureSample']} })
    sample_class: Literal["CellCultureSample"] = Field(default="CellCultureSample", description="""Names the concrete Sample subclass (TissueSample / CellCultureSample / PlantSample / EnvironmentalSample). Redundant with sample_type but required so polymorphic instances round-trip and validate against the right subclass.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'designates_type': True,
         'domain_of': ['Sample']} })
    organism: OntologyTermValue = Field(default=..., description="""Source organism. Maps from Sample_Information.Organism.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be an NCBITaxon term.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'OrganismEnum'}],
         'domain_of': ['Sample']} })
    sample_type: SampleType = Field(default=..., description="""Biological sample kind; discriminator selecting the Sample subclass. Genuinely internal/structural, so a static enum is correct here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['Sample']} })
    health_status: Optional[HealthStatusEnum] = Field(default=None, description="""Case/control/experimental health state. Part of the current free-text Condition field (see README migration proposal). EFO was checked first; its matching terms are study-DESIGN classes rather than per-sample state values, so a small static enum is used, mapping `control` to EFO where it fits. `other` is the escape value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })
    genetic_background: Optional[OntologyTermValue] = Field(default=None, description="""Strain / genotype / cultivar. Part of the current free-text Condition field. No single OLS ontology covers strain nomenclature well (MGI and Cellosaurus are external registries), so free text is expected here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })
    disease: Optional[OntologyTermValue] = Field(default=None, description="""Disease state, if any. Part of the current free-text Condition field. Bound to MONDO: EFO's disease branch is imported MONDO terms, so MONDO is the real source (see README EFO-vs-MONDO note).""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be a MONDO disease '
                                      'term.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'DiseaseEnum'}],
         'domain_of': ['Sample']} })
    protocol_description: Optional[str] = Field(default=None, description="""Always free text, never ontology-bound. Absorbs the current Additional_Information.Supplementary and Sample_Information .Sample_Growth_Conditions (treatment/intervention prose); deeper treatment modeling belongs to xstats, not here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })


class PlantSample(Sample):
    """
    Stub for plant samples. Anatomy for plant samples is Plant Ontology (PO) rather than Uberon; fleshed out in a later pass.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://metaspace2020.org/schema/metaspace_submission'})

    sample_class: Literal["PlantSample"] = Field(default="PlantSample", description="""Names the concrete Sample subclass (TissueSample / CellCultureSample / PlantSample / EnvironmentalSample). Redundant with sample_type but required so polymorphic instances round-trip and validate against the right subclass.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'designates_type': True,
         'domain_of': ['Sample']} })
    organism: OntologyTermValue = Field(default=..., description="""Source organism. Maps from Sample_Information.Organism.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be an NCBITaxon term.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'OrganismEnum'}],
         'domain_of': ['Sample']} })
    sample_type: SampleType = Field(default=..., description="""Biological sample kind; discriminator selecting the Sample subclass. Genuinely internal/structural, so a static enum is correct here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['Sample']} })
    health_status: Optional[HealthStatusEnum] = Field(default=None, description="""Case/control/experimental health state. Part of the current free-text Condition field (see README migration proposal). EFO was checked first; its matching terms are study-DESIGN classes rather than per-sample state values, so a small static enum is used, mapping `control` to EFO where it fits. `other` is the escape value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })
    genetic_background: Optional[OntologyTermValue] = Field(default=None, description="""Strain / genotype / cultivar. Part of the current free-text Condition field. No single OLS ontology covers strain nomenclature well (MGI and Cellosaurus are external registries), so free text is expected here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })
    disease: Optional[OntologyTermValue] = Field(default=None, description="""Disease state, if any. Part of the current free-text Condition field. Bound to MONDO: EFO's disease branch is imported MONDO terms, so MONDO is the real source (see README EFO-vs-MONDO note).""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be a MONDO disease '
                                      'term.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'DiseaseEnum'}],
         'domain_of': ['Sample']} })
    protocol_description: Optional[str] = Field(default=None, description="""Always free text, never ontology-bound. Absorbs the current Additional_Information.Supplementary and Sample_Information .Sample_Growth_Conditions (treatment/intervention prose); deeper treatment modeling belongs to xstats, not here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })


class EnvironmentalSample(Sample):
    """
    Stub for environmental samples; fleshed out in a later pass.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://metaspace2020.org/schema/metaspace_submission'})

    sample_class: Literal["EnvironmentalSample"] = Field(default="EnvironmentalSample", description="""Names the concrete Sample subclass (TissueSample / CellCultureSample / PlantSample / EnvironmentalSample). Redundant with sample_type but required so polymorphic instances round-trip and validate against the right subclass.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'designates_type': True,
         'domain_of': ['Sample']} })
    organism: OntologyTermValue = Field(default=..., description="""Source organism. Maps from Sample_Information.Organism.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be an NCBITaxon term.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'OrganismEnum'}],
         'domain_of': ['Sample']} })
    sample_type: SampleType = Field(default=..., description="""Biological sample kind; discriminator selecting the Sample subclass. Genuinely internal/structural, so a static enum is correct here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['Sample']} })
    health_status: Optional[HealthStatusEnum] = Field(default=None, description="""Case/control/experimental health state. Part of the current free-text Condition field (see README migration proposal). EFO was checked first; its matching terms are study-DESIGN classes rather than per-sample state values, so a small static enum is used, mapping `control` to EFO where it fits. `other` is the escape value.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })
    genetic_background: Optional[OntologyTermValue] = Field(default=None, description="""Strain / genotype / cultivar. Part of the current free-text Condition field. No single OLS ontology covers strain nomenclature well (MGI and Cellosaurus are external registries), so free text is expected here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })
    disease: Optional[OntologyTermValue] = Field(default=None, description="""Disease state, if any. Part of the current free-text Condition field. Bound to MONDO: EFO's disease branch is imported MONDO terms, so MONDO is the real source (see README EFO-vs-MONDO note).""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be a MONDO disease '
                                      'term.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'DiseaseEnum'}],
         'domain_of': ['Sample']} })
    protocol_description: Optional[str] = Field(default=None, description="""Always free text, never ontology-bound. Absorbs the current Additional_Information.Supplementary and Sample_Information .Sample_Growth_Conditions (treatment/intervention prose); deeper treatment modeling belongs to xstats, not here.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['Sample']} })


class AcquisitionInfo(ConfiguredBaseModel):
    """
    Instrument / acquisition metadata in scope for this pass. Kept separate from both Sample and from DSConfig. Numeric acquisition parameters that feed DSConfig (resolving power -> isocalc_sigma) or acq_geometry (pixel size) are intentionally NOT duplicated here.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://metaspace2020.org/schema/metaspace_submission',
         'slot_usage': {'instrument_model': {'name': 'instrument_model',
                                             'required': True},
                        'ionization_source': {'name': 'ionization_source',
                                              'required': True},
                        'polarity': {'name': 'polarity', 'required': True}}})

    polarity: PolarityValue = Field(default=..., description="""Ion mode. Already a validated enum today (Positive/Negative); kept as an enum with PSI-MS meaning mappings, wrapped in a ReconciledValue so it can be cross-checked against the imzML file in Phase 2.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['AcquisitionInfo']} })
    ionization_source: IonizationSourceValue = Field(default=..., description="""Ionization source. Maps from MS_Analysis.Ionisation_Source (free text today). PSI-MS bound, ReconciledValue-wrapped.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['AcquisitionInfo']} })
    instrument_model: InstrumentModelValue = Field(default=..., description="""Instrument model. Maps from MS_Analysis.Analyzer (free text today, substring-checked in app code). PSI-MS bound, ReconciledValue-wrapped.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'core'}},
         'domain_of': ['AcquisitionInfo']} })
    maldi_matrix: Optional[OntologyTermValue] = Field(default=None, description="""MALDI matrix compound. Maps from Sample_Preparation.MALDI_Matrix (defaults to \"none\" today). ChEBI bound; frequent free-text fallback expected.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be a ChEBI compound.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'ChebiCompoundEnum'}],
         'domain_of': ['AcquisitionInfo']} })
    maldi_matrix_application: Optional[OntologyTermValue] = Field(default=None, description="""How the matrix was applied (e.g. sublimation, spray coating). Maps from Sample_Preparation.MALDI_Matrix_Application. This is a process/method, not a compound: ChEBI does not fit and OBI has no matrix-application branch, so it is free text pending a suitable method vocabulary (see README).""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'recommended'}},
         'domain_of': ['AcquisitionInfo']} })
    solvent: Optional[OntologyTermValue] = Field(default=None, description="""Matrix solvent. Maps from Sample_Preparation.Solvent (defaults to \"none\"). Minor field; ChEBI bound but low priority.""", json_schema_extra = { "linkml_meta": {'annotations': {'tier': {'tag': 'tier', 'value': 'extension'}},
         'bindings': [{'binds_value_of': 'value_ontology_id',
                       'description': 'value_ontology_id should be a ChEBI compound.',
                       'obligation_level': 'RECOMMENDED',
                       'range': 'ChebiCompoundEnum'}],
         'domain_of': ['AcquisitionInfo']} })


# Model rebuild
# see https://pydantic-docs.helpmanual.io/usage/models/#rebuilding-a-model
Dataset.model_rebuild()
OntologyTermValue.model_rebuild()
ReconciledValue.model_rebuild()
PolarityValue.model_rebuild()
IonizationSourceValue.model_rebuild()
InstrumentModelValue.model_rebuild()
Sample.model_rebuild()
TissueSample.model_rebuild()
CellCultureSample.model_rebuild()
PlantSample.model_rebuild()
EnvironmentalSample.model_rebuild()
AcquisitionInfo.model_rebuild()
