import json
from pathlib import Path
from typing import Union


def load_config(config_path: Union[str, Path]) -> dict:
    with open(config_path) as f:
        return json.load(f)
