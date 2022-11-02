from sm.engine.formula_parser import format_ion_formula, safe_generate_ion_formula

ION_INS = (
    'INSERT INTO graphql.ion (ion, formula, chem_mod, neutral_loss, adduct, charge, ion_formula) '
    'VALUES (%s, %s, %s, %s, %s, %s, %s) '
    'RETURNING id'
)
ION_SEL = (
    'WITH ions AS ('
    '   SELECT UNNEST(%s::text[]) as fo, UNNEST(%s::text[]) as cm, '
    '       UNNEST(%s::text[]) as nl, UNNEST(%s::text[]) as ad'
    ') '
    'SELECT formula, chem_mod, neutral_loss, adduct, id '
    'FROM graphql.ion '
    'JOIN ions ON formula = fo AND chem_mod = cm AND neutral_loss = nl AND adduct = ad '
    'WHERE charge = %s'
)
MOL_SEL = (
    'SELECT id, mol_id, mol_name, formula '
    'FROM public.molecule '
    'WHERE moldb_id = %s AND mol_name = %s LIMIT 1'
)

MOL_SEL_ALL = 'SELECT id, mol_id, mol_name, formula FROM public.molecule WHERE moldb_id = %s'


def get_ion_id_mapping(db, ion_tuples, charge):
    """Get a mapping of ions to ion ids, adding missing ions to the database if necessary
    Args
    ------------
    ion_tuples : list[tuple[str, str, str, str]]
        (formula, chem_mod, neutral_loss, adduct) tuples
    charge : int
        1 or -1
    Returns
    ------------
    dict[tuple[str, str, str, str], int]
        (formula, chem_mod, neutral_loss, adduct) => ion_id
    """
    if not ion_tuples:
        return {}

    formulas, chem_mods, neutral_losses, adducts = map(list, zip(*ion_tuples))
    existing_ions = db.select(ION_SEL, [formulas, chem_mods, neutral_losses, adducts, charge])
    ion_to_id = dict(((fo, cm, nl, ad), id) for fo, cm, nl, ad, id in existing_ions)
    missing_ions = sorted(set(ion_tuples).difference(ion_to_id.keys()), key=lambda row: row[0])

    if missing_ions:
        rows = [
            (format_ion_formula(*ion, charge=charge), *ion, charge, safe_generate_ion_formula(*ion))
            for ion in missing_ions
        ]
        ids = db.insert_return(ION_INS, rows)
        ion_to_id.update((row[1:5], id) for id, row in zip(ids, rows))

    return ion_to_id


def find_all_mol(db, moldb_id):
    return db.select(MOL_SEL_ALL, [moldb_id])


def find_mol_by_name(db, moldb_id, mol_name):
    return db.select_one(MOL_SEL, [moldb_id, mol_name])
