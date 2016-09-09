#/usr/bin/env bash
source /miniconda/bin/activate sm_engine
export PYTHONPATH=/code/sm-engine:$PYTHONPATH
python scripts/import_molecule_formula_db.py --yes=True $1 /databases/$2
