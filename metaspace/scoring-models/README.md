## METASPACE-ML overview
METASPACE-ML is a machine learning-based approach which incorporates new scores, provides more computationally-efficient False Discovery Rate estimation and improves annotation coverage, quality and reliability. METASPACE-ML has been trained and evaluated using a comprehensive set of 1,710 datasets from 159 researchers from 47 labs encompassing both animal and plant-based datasets with a balanced representation of various spatial metabolomics contexts. For more information, check out our [bioArxiv paper](https://www.biorxiv.org/content/10.1101/2023.05.29.542736v2).

## Model selection
Since most datasets are either animal or plant based datasets, we have developed separate models for each kingdom accordingly. Select [METASPACE-ML_Animal](./v3_default/Animal_v3.2023-12-14.cbm) or [METASPACE-ML_Plant](./v3_default/Plant_v3.2023-12-14.cbm) based on whether the submitted samples are obtained from species that are classified into animal or plant kingdom, respectively. If the samples are obtained from a different kingdom (e.g. Bacteria or Fungi), please use [METASPACE-ML_Animal](./v3_default/Animal_v3.2023-12-14.cbm) as this model is trained on a broader range of datasets and is designed to be indifferent to sample-specific metadata, focusing solely on ions and their corresponding feature scores.

## ML Models for annotation scoring/FDR

These can be installed with the following commands (assuming engine is already set up):
```bash
source activate sm38
cd ../engine
# Usage: python -m scripts.import_scoring_model <name> <version> <model type> <model path> <S3 bucket to upload to>
python -m scripts.import_scoring_model "Animal" "v2.2023-12-14" "catboost" --model="../scoring-models/models_default/v2.2023-12-14_(METASPACE-ML_Animal).cbm" --bucket="sm-engine-dev"

```

## List of datasets used for training and testing METASPACE-ML
The public training and testing datasets are available for download on METASPACE.
More information on each dataset can be accessed from [training](./datasets/training.csv) and [testing](./datasets/testing.csv) CSV files.