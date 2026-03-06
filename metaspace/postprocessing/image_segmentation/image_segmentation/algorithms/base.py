# metaspace/segmentation/algorithms/base.py

from __future__ import annotations

from abc import ABC, abstractmethod

from ..types import RawAlgorithmOutput, SegmentationInput


class BaseSegmentationAlgorithm(ABC):

    @property
    @abstractmethod
    def algorithm_name(self) -> str:
        """
        String identifier for this algorithm.
        Must match the key used in the algorithm registry.
        e.g. "pca_gmm", "spatial_dgmm", "sasa"
        """
        ...

    @abstractmethod
    def validate_parameters(self, parameters: dict) -> dict:
        """
        Validate and fill defaults for algorithm-specific parameters.

        Args:
            parameters: raw parameter dict from the job payload

        Returns:
            completed parameter dict with all defaults applied

        Raises:
            ValueError: for invalid or incompatible parameter combinations
        """
        ...

    @abstractmethod
    def run(
        self,
        segmentation_input: SegmentationInput,
        parameters: dict,
    ) -> RawAlgorithmOutput:
        """
        Execute the segmentation algorithm.

        Args:
            segmentation_input: preprocessed, NaN-free SegmentationInput
            parameters:         validated parameter dict from validate_parameters

        Returns:
            RawAlgorithmOutput conforming to the shared contract
        """
        ...