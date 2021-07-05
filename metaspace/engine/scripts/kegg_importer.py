import argparse
import re

import pandas as pd


def get_inchi(filename):
    """Read INCHI file."""
    molecules = {}
    with open(filename) as f:
        for line in f.readlines():
            _id, inchi = line.split('\t')
            molecules[_id] = {'inchi': inchi.strip()}

    return molecules


def get_name_and_formula(filename, molecules_inchi):
    """Read base file and filtered some molecules."""
    molecules = {}
    with open(filename) as f:
        molecule = {}
        for line in f.readlines():
            if line.startswith('ENTRY'):
                molecule['id'] = re.sub('[ ]+', ' ', line).split(' ')[1].strip()
            if line.startswith('NAME'):
                molecule['name'] = line.replace('NAME', '').strip().strip(';')
            if line.startswith('FORMULA'):
                formula = line.replace('FORMULA', '').strip()
                # skip molecule with `(`, `.` or `R\d+` symbols
                if '(' in formula or '.' in formula or re.findall(r'R\d{0,2}$', formula):
                    continue
                molecule['formula'] = formula

            # this is the end of the block of the molecule
            if line.startswith('///'):
                if molecules_inchi.get(molecule['id']):
                    inchi = molecules_inchi[molecule['id']]['inchi']
                    molecule['inchi'] = inchi
                    if (
                        inchi
                        and molecule.get('id')
                        and molecule.get('name')
                        and molecule.get('formula')
                    ):
                        molecules[molecule['id']] = molecule
                        molecule = {}

    return molecules


def main():
    help_msg = 'Create TSV file for KEGG database'
    parser = argparse.ArgumentParser(description=help_msg)
    parser.add_argument('main_file', type=str, help='Name of file with whole info about molecules')
    parser.add_argument('inchi_file', type=str, help='INCHI file')
    parser.add_argument('--output_file', default='./kegg.tsv', help='Output TSV file')
    args = parser.parse_args()

    molecules_inchi = get_inchi(args.inchi_file)
    molecules = get_name_and_formula(args.main_file, molecules_inchi)

    df = pd.DataFrame.from_records(list(molecules.values()))
    df.to_csv(args.output_file, sep='\t')


if __name__ == '__main__':
    main()
