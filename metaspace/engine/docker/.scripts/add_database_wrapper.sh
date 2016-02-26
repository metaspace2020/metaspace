#/usr/bin/env bash
source /miniconda/bin/activate sm_distributed
export PYTHONPATH=/code/SM_distributed:$PYTHONPATH
python scripts/import_molecule_formula.py --yes=True $1 /databases/$2
