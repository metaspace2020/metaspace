"""Merge byte ranges into few HTTP range requests."""
from typing import Any, List, Tuple

Range = Tuple[int, int, Any]  # start, end (exclusive), caller tag
Request = Tuple[int, int, List[Range]]  # start, end, member ranges


def coalesce_ranges(ranges: List[Range], gap: int, max_bytes: int) -> List[Request]:
    """Sort ranges by start and merge those within ``gap`` bytes, keeping each request
    under ``max_bytes`` unless a single range is larger. Overlapping or identical ranges
    collapse into one request."""
    requests: List[Request] = []
    for start, end, tag in sorted(ranges, key=lambda r: r[0]):
        if requests:
            req_start, req_end, members = requests[-1]
            if start - req_end <= gap and max(req_end, end) - req_start <= max_bytes:
                members.append((start, end, tag))
                requests[-1] = (req_start, max(req_end, end), members)
                continue
        requests.append((start, end, [(start, end, tag)]))
    return requests
