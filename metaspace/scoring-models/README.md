## ML Models for annotation scoring/FDR

These can be installed with the following commands (assuming engine is already set up):
```bash
source activate sm38
cd ../engine
# Usage: python -m scripts.import_scoring_model <name> <version> <model path> <S3 bucket to upload to>
python -m scripts.import_scoring_model "Animal" "v2.2023-12-14" "../scoring-models/models_default/v2.2023-12-14_(METASPACE-ML_Animal).cbm" sm-engine-dev
```

## List of datasets used for training and testing the model
The public training and testing datasets are available for download on METASPACE. 
More information on each dataset can be accessed from [training](./datasets/training.csv) and [testing](./datasets/testing.csv) CSV files.