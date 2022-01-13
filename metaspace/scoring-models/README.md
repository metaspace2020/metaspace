## ML Models for annotation scoring/FDR

These can be installed with the following commands (assuming engine is already set up):
```bash
source activate sm38
cd ../engine
# Usage: python -m scripts.import_scoring_model <name> <model path> <S3 bucket to upload to>
python -m scripts.import_scoring_model v3_default ../scoring-models/v3_default/model-2022-01-05T13-45-26.947188-416b1311.cbm sm-engine-dev
```