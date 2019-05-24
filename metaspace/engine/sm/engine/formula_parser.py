import re
from collections import Counter

clean_regexp = re.compile(r'[.=]')
formula_regexp = re.compile(r'([A-Z][a-z]*)([0-9]*)')
adduct_validate_regexp = re.compile(r'^([+-]([A-Z][a-z]*[0-9]*)+)+$')
adduct_regexp = re.compile(r'([+-])([A-Za-z0-9]+)')


class ParseFormulaError(Exception):
    def __init__(self, message):
        self.message = message


def parse_formula(f):
    return [(elem, int(n or '1'))
            for (elem, n) in formula_regexp.findall(f)]


def _hill_system_sort(ion_elements):
    """ Reorder elements to be consistently ordered per https://en.wikipedia.org/wiki/Chemical_formula#Hill_system """
    if ion_elements['C'] != 0:
        return ['C', 'H', *sorted(key for key in ion_elements.keys() if key not in ('C', 'H'))]
    else:
        return sorted(key for key in ion_elements.keys())


def _chnops_sort(ion_elements):
    """ Reorder elements to be consistently ordered per the method in pyMSpec """
    return [*'CHNOPS', *sorted(key for key in ion_elements.keys() if len(key) > 1 or key not in 'CHNOPS')]


def generate_ion_formula(formula, *adducts):
    formula = clean_regexp.sub('', formula)
    adducts = [clean_regexp.sub('', adduct) for adduct in adducts]
    adducts = [adduct for adduct in adducts if adduct]

    ion_elements = Counter(dict(parse_formula(formula)))

    for adduct in adducts:
        if not adduct_validate_regexp.match(adduct):
            raise ParseFormulaError(f'Invalid adduct: {adduct}')
        for op, adduct_part in adduct_regexp.findall(adduct):
            assert op in ('+','-'), 'Adduct should be prefixed with + or -'
            for elem, n in parse_formula(adduct_part):
                if op == '+':
                    ion_elements[elem] += n
                else:
                    ion_elements[elem] -= n
                    if ion_elements[elem] < 0:
                        raise ParseFormulaError(f'Negative total element count for {elem}')

    if not any(count > 0 for count in ion_elements.values()):
        raise ParseFormulaError('No remaining elements')

    # element_order = _hill_system_sort(ion_elements)
    element_order = _chnops_sort(ion_elements)

    ion_formula_parts = []
    for elem in element_order:
        count = ion_elements[elem]
        if count != 0:
            ion_formula_parts.append(elem)
            if count > 1:
                ion_formula_parts.append(str(count))

    return ''.join(ion_formula_parts)


def safe_generate_ion_formula(*parts):
    try:
        return generate_ion_formula(*(part for part in parts if part))
    except ParseFormulaError as er:
        return None
