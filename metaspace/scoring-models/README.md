## ML Models for annotation scoring/FDR

These can be installed with the following commands (assuming engine is already set up):
```bash
source activate sm38
cd ../engine
# Usage: python -m scripts.import_scoring_model <name> <model path> <S3 bucket to upload to>
python -m scripts.import_scoring_model v3_default "../scoring-models/v3_default/v2.20230517_(METASPACE-ML).cbm" sm-engine-dev
```

## List of datasets used for training and testing the model
The public training and testing datasets are available for download on METASPACE. 
More information on each dataset can be accessed from [training](./datasets/trainig.csv) and [testing](./datasets/testing.csv) CSV files.