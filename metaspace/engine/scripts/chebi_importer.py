# pylint: skip-file
from __future__ import print_function
import logging

"""
Requirements: networkx and pyMSpec packages, wget

See example of usage at the end of the file.
"""

import networkx as nx
import subprocess
from pyMSpec.pyisocalc import pyisocalc

logging.basicConfig(level=logging.INFO)


def oboTerms(obo_fn):
    """
    Simple OBO parser, yields a dictionary for every encountered term
    """
    term = {}
    with open(obo_fn, "r") as f:
        for line in f:
            line = line.strip()
            if line.startswith("[Term]"):
                if term:
                    yield term
                term = {}
            else:
                try:
                    key, value = line.split(": ", 1)
                    if key == 'id' or key == 'name':
                        term[key] = value
                    else:
                        if key in term:
                            term[key].append(value)
                        else:
                            term[key] = [value]
                except:
                    pass
        if term:
            yield term


class ChebiOntology(object):
    def __init__(self):
        self.updateChebi()
        self.readRelationships()

    def updateChebi(self):
        logging.info('Updating CheBI ontology...')

        # https://www.gnu.org/software/wget/manual/html_node/Time_002dStamping-Usage.html
        # cmd = "wget -N ftp://ftp.ebi.ac.uk/pub/databases/chebi/ontology/chebi.obo"
        cmd = "wget -N ftp://ftp.ebi.ac.uk/pub/databases/chebi/archive/rel138/ontology/chebi.obo"
        subprocess.check_call(cmd, shell=True)
        self.filename = "chebi.obo"

    def readRelationships(self):
        """
        currently links nodes through 'is_a', 'has_role'
        without any distinction between the two
        """
        logging.info('Loading CheBI ontology into a graph...')
        self._g = nx.DiGraph()
        self._nodes_by_id = {}
        self._ids_by_name = {}
        metabolite = None

        for term in oboTerms(self.filename):
            if 'id' not in term:
                continue
            if term.get('name') == 'metabolite':
                metabolite = term['id']
            if 'is_a' in term:
                for parent in term['is_a']:
                    self._g.add_edge(parent, term['id'])
            if 'relationship' in term:
                for parent in term['relationship']:
                    if parent.startswith('has_role'):
                        role = parent.split(' ', 1)[1]
                        self._g.add_edge(role, term['id'])

            for synonym in term.get('synonym', []):
                if 'RELATED FORMULA' in synonym:
                    s = synonym.split('"')[1]
                    term['sum_formula'] = s

                    try:
                        sf = pyisocalc.parseSumFormula(s)
                        term['_sf'] = sf
                    except:
                        pass
                elif 'RELATED InChI ' in synonym:
                    term['InChI'] = synonym.split('"')[1]
                elif 'RELATED InChIKey' in synonym:
                    term['InChIKey'] = synonym.split('"')[1]

            self._nodes_by_id[term['id']] = term
            self._ids_by_name[term['name']] = term['id']

        logging.info('Found {} terms.'.format(len(self._nodes_by_id)))

    def termsBelow(self, name, filters=[]):
        """
        Returns a DFS-based generator of terms below a node.
        If filters (term -> boolean functions) are provided,
        yields only formulas satisfying all of them.

        Example of usage:

           chebi = ChebiOntology()
           filters = [containsElement('C')]
           for term in chebi.termsBelow('rat metabolite', filters):
               print(term['id'])
        """
        metabolite = self._ids_by_name.get(name, None)
        if metabolite is None:
            return

        for id in nx.dfs_tree(self._g, metabolite):
            node = self._nodes_by_id[id]
            if all(f(node) for f in filters):
                yield node


### ------------------- Filters for nodes -------------------------


def hasValidFormula():
    """
    Checks if the formula can be parsed by pyisocalc
    """

    def _filter(term):
        return term.get('_sf') is not None

    return _filter


def checks_for_valid_sf(filter_gen):
    _validator = hasValidFormula()

    def _wrapper(*args, **kwargs):
        _filter = filter_gen(*args, **kwargs)

        def _validating_filter(term):
            if not _validator(term):
                return False
            return _filter(term)

        return _validating_filter

    return _wrapper


@checks_for_valid_sf
def containsElement(element):
    """
    Checks if the formula contains an element (specified as a string)
    """
    segment_has_element = lambda x: str(x.element()) == element and x.amount() >= 1

    def _filter(term):
        return any(segment_has_element(x) for x in term['_sf'].get_segments())

    return _filter


@checks_for_valid_sf
def hasAverageMassWithinRange(min_mass, max_mass):
    """
    Checks if the average mass in Da is within [min_mass, max_mass] range
    """

    def _filter(term):
        return min_mass <= term['_sf'].average_mass() <= max_mass

    return _filter


if __name__ == '__main__':
    chebi = ChebiOntology()
    filters = [containsElement('C'), hasAverageMassWithinRange(50, 2000)]
    for term in chebi.termsBelow('metabolite', filters):
        # [6:] strips 'CHEBI:' prefix
        print("\t".join([term['id'][6:], term['name'], term['sum_formula']]))
