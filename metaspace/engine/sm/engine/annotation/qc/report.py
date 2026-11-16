import math
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

GATE_VERSION = 1


class Evidence(str, Enum):
    DIRECT = 'direct'
    INFERRED = 'inferred'
    NOT_ASSESSABLE = 'not_assessable'


class Mode(str, Enum):
    SHADOW = 'shadow'
    BLOCK = 'block'


@dataclass
class CheckResult:
    name: str
    tier: str
    value: Any = None
    threshold: Any = None
    evidence: Evidence = Evidence.DIRECT
    would_block: bool = False
    mode: Mode = Mode.SHADOW
    runtime_ms: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


@dataclass
class QCReport:
    checks: List[CheckResult] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)
    timings: Dict[str, float] = field(default_factory=dict)
    gate_version: int = GATE_VERSION
    error: Optional[str] = None

    @property
    def would_block(self) -> bool:
        return any(c.would_block for c in self.checks)

    def add(self, result: CheckResult):
        self.checks.append(result)
        self.timings[result.name] = result.runtime_ms

    def to_json(self) -> Dict[str, Any]:
        return {
            'gate_version': self.gate_version,
            'would_block': self.would_block,
            'error': self.error,
            'checks': [_jsonable(asdict(c)) for c in self.checks],
            'metrics': _jsonable(self.metrics),
            'timings': _jsonable(self.timings),
        }


def _jsonable(obj: Any) -> Any:
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, dict):
        return {str(k): _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(v) for v in obj]
    if hasattr(obj, 'tolist'):
        return _jsonable(obj.tolist())
    if isinstance(obj, float) and math.isnan(obj):
        return None
    return obj
