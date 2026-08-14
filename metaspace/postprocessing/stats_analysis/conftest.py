"""Ensure the package directory is importable when running ``pytest`` directly."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
