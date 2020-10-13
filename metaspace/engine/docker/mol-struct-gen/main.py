import argparse
import re
from pathlib import Path

import pandas as pd
from openbabel import openbabel as obabel

obConversion = obabel.OBConversion()
obConversion.SetInAndOutFormats('inchi', 'svg')


def draw_structure(inchi):
    ob_mol = obabel.OBMol()
    obConversion.ReadString(ob_mol, inchi)
    mol_svg = obConversion.WriteString(ob_mol)
    return re.sub('fill=\"white\"', 'fill-opacity=\"0\"', mol_svg)


def draw_structures_from_df(mols_df, structures_dir):
    n = mols_df.shape[0]
    for i, (_, mol) in enumerate(mols_df.iterrows(), 1):
        try:
            file_path = structures_dir / (mol['id'] + '.svg')
            if mol.inchi and not file_path.exists():
                print(f'Drawing ({i}/{n}):', mol['id'], mol.inchi)
                mol_svg = draw_structure(mol.inchi)
                with file_path.open('w') as f:
                    f.write(mol_svg)
        except Exception as e:
            print(e)
            print(mol)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate molecular structure images')
    parser.add_argument('database_file', type=str, help='Path to database TSV file')
    parser.add_argument('images_dir', type=str, help='Path to save generated images to')
    args = parser.parse_args()

    structures_dir = Path(args.images_dir)
    structures_dir.mkdir(parents=True, exist_ok=True)

    mols_df = pd.read_csv(args.database_file, sep='\t')
    draw_structures_from_df(mols_df, structures_dir)
