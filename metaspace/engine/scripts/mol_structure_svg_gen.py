from __future__ import print_function
import pybel
import os.path

# This script produces SVG images of molecular structures.
# The input are tables with InChi keys (last field) and IDs (first field).
# The created images have white background, which can be turned into transparent
# by running sed afterwards:
#
# for i in *.svg; do sed -i 's/<rect x="0" y="0".*fill="white"\/>//' $i; done

DATABASE_DIR = 'databases/databases_201701'

DATABASE_PATHS = {
    'HMDB': 'hmdb.tsv',
    'ChEBI': 'chebi.tsv',
    'LIPID_MAPS': 'lipidmaps.tsv',
    'SwissLipids': 'swissLipids_Isomeric subspecies20170111.tsv',
    'KEGG': 'kegg.tsv'
}

OUTPUT_DIR = 'databases/mol-images'

def generateSvg(inchi, filename):
    if os.path.exists(filename):
        return
    mol = pybel.readstring('inchi', inchi)
    mol.write('svg', filename=filename)

def readCompounds(db_name, tsv_filename):
    # skip header line, assume first and last fields are id and inchi
    k = -1
    valid = 0
    for line in open(tsv_filename):
        k += 1
        if k == 0:
            continue
        fields = line.split('\t')
        id, inchi = fields[0], fields[-1]
        if not inchi.startswith('InChI'):
            continue
        valid += 1
        yield id, inchi
    print("{}: scanned {} records, {} with InChI ({:.1f}%)"
          .format(db_name, k, valid, float(valid) / k * 100.0))


if not os.path.exists(OUTPUT_DIR):
    os.mkdir(OUTPUT_DIR)

for db_name in DATABASE_PATHS:
    input_fn = os.path.join(DATABASE_DIR, DATABASE_PATHS[db_name])
    output_subdir = os.path.join(OUTPUT_DIR, db_name)
    if not os.path.exists(output_subdir):
        os.mkdir(output_subdir)
    for id, inchi in readCompounds(db_name, input_fn):
        svg_fn = os.path.join(output_subdir, id + '.svg')
        generateSvg(inchi, svg_fn)
