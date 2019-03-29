## CSV Export

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

### Molecule IDs

In the Annotations CSV file, each row may specify multiple values in the moleculeNames and moleculeIds columns. 
The items in these lists are delimited by `, ` (comma then space). If a molecule name naturally contains a comma 
followed by one or more spaces, such as [HMDB0032389](http://www.hmdb.ca/metabolites/HMDB0032389), then the spaces are
removed to ensure they're unambiguously parseable, e.g. 
"Methyl acrylate-divinylbenzene, completely hydrolyzed, copolymer" would become
"Methyl acrylate-divinylbenzene,completely hydrolyzed,copolymer".

### Character Encoding 

Some spreadsheet programs will occasionally incorrectly detect the character encoding of the CSV files,
causing names such as [8-hydroxy-2-phenyl-1λ⁴-chromen-1-ylium](http://www.hmdb.ca/metabolites/HMDB0133413) to appear
mangled, e.g. as "8-hydroxy-2-phenyl-1Î»â´-chromen-1-ylium". The solution to this is to close the file, reopen it 
and select **Unicode (UTF-8)** or **UTF-8** as the character encoding when prompted. 
 
