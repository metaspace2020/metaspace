from sm.engine.formula_parser import format_ion_formula

ION_INS = ('INSERT INTO graphql.ion (ion, formula, adduct, charge) ' 
           'VALUES (%s, %s, %s, %s) ' 
           'RETURNING id')
ION_SEL = ('SELECT ion, id ' 
           'FROM graphql.ion ' 
           'WHERE ion = ANY(%s)')


def get_ion_id_mapping(db, ion_tuples, charge):
    """Get a mapping of ions to ion ids, adding missing ions to the database if necessary
    Args
    ------------
    ion_tuples : list[tuple[str, str]]
        (formula, adduct) tuples
    charge : int
        1 or -1
    Returns
    ------------
    dict[tuple[str, str], int]
        (formula, adduct) => ion_id
    """

    ion_formulas = [format_ion_formula(formula, adduct, charge=charge) for formula, adduct in ion_tuples]
    ion_to_mol = dict(zip(ion_formulas, ion_tuples))
    ion_to_id = dict(db.select(ION_SEL, [ion_formulas]))
    missing_ions = sorted(set(ion_formulas).difference(ion_to_id.keys()))

    if missing_ions:
        rows = [(ion, *ion_to_mol[ion], charge) for ion in missing_ions]
        ids = db.insert_return(ION_INS, rows)
        ion_to_id.update((row[0], id) for id, row in zip(ids, rows))

    return dict((ion_to_mol[ion], ion_to_id[ion]) for ion in ion_formulas)