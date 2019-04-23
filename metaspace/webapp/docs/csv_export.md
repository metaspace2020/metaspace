# CSV Export

## Loading the .csv file

### Comment lines

The CSV files exported by METASPACE contain a timestamp and a link to the source data in the first two lines of the file.
This can cause issues with some CSV loaders.

To load a METASPACE CSV export with Pandas use the `skiprows=2` argument:

```python
import pandas as pd
annotations = pd.read_csv('metaspace_annotations.csv', skiprows=2)
```

In plain Python:

```python
from csv import DictReader
annotations_lines = open('metaspace_annotations.csv').readlines()[2:]
annotations = list(DictReader(annotations_lines))
```

### Character Encoding 

Some spreadsheet programs will occasionally incorrectly detect the character encoding of the CSV files,
causing names such as [8-hydroxy-2-phenyl-1λ⁴-chromen-1-ylium](http://www.hmdb.ca/metabolites/HMDB0133413) to appear
mangled, e.g. as "8-hydroxy-2-phenyl-1Î»â´-chromen-1-ylium". The solution to this is to close the file, reopen it 
and select **Unicode (UTF-8)** or **UTF-8** as the character encoding when prompted. 

## Information about specific columns

### Molecule IDs

In the Annotations CSV file, each row may specify multiple values in the moleculeNames and moleculeIds columns. 
The items in these lists are delimited by `, ` (comma then space). If a molecule name naturally contains a comma 
followed by one or more spaces, such as [HMDB0032389](http://www.hmdb.ca/metabolites/HMDB0032389), then the spaces are
removed to ensure they're unambiguously parseable, e.g. 
"Methyl acrylate-divinylbenzene, completely hydrolyzed, copolymer" would become
"Methyl acrylate-divinylbenzene,completely hydrolyzed,copolymer".
 
### Off-sample

The `rawOffSampleProb` column contains the unmodified raw output of the off-sample prediction model as a number from 
`0.0` to `1.0`. For most datasets this number is close to the probability that the ion image is off-sample, 
however it is not guaranteed to be accurate. Datasets that are too dissimilar to the datasets that the model 
was trained on will have less accuracy. Furthermore, toward the extremes of the scale, the model tends to be 
overconfident. e.g. a prediction with a `rawOffSampleProb` value of `0.0000001` may still have a 1-10% chance of 
being off-sample. 
