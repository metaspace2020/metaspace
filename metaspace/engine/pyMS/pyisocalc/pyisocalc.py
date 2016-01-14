#!/usr/bin/env python
#########################################################################
# Author: Andy Ohlin (debian.user@gmx.com)
# Modified by: Andrew Palmer (palmer@embl.de)
#              Artem Tarasov (lomereiter@gmail.com)
#
# Example usage:
# pyisocalc('Fe(ClO3)5',plot=false,gauss=0.25,charge=-2,resolution=250)
# Do "pyisocalc('--help') to find out more
#
##########################################################################
# Version 0.2 -- Modified from v0.8 of Andy Ohlin's code
#
# Dependencies:
# python2.7, python-numpy, python-matplotlib
# pyms-mass_spectrum
#
# Isotopic abundances and masses were copied from Wsearch32.
# Elemental oxidation states were mainly
# taken from Matthew Monroe's molecular weight calculator, with some changes.
#########################################################################
from collections import OrderedDict
import re  # for regular expressions

import numpy as np
from numpy import exp  # misc math functions
from numpy import asarray  # for cartesian product

from ..mass_spectrum import MassSpectrum
from ..centroid_detection import gradient

ver = '0.2 (5 Sep. 2015)'

# values are taken from http://www.ciaaw.org/pubs/TICE-2009.pdf
periodic_table = OrderedDict(
    H=[1, 1, [1.007825032, 2.014101778], [0.999885, 0.000115]],
    He=[2, 0, [3.016029319, 4.002603254], [1.34e-06, 0.99999866]],
    Li=[3, 1, [6.0151223, 7.0160041], [0.0759, 0.9241]],
    Be=[4, 2, [9.0121822], [1.0]],
    B=[5, 3, [10.0129371, 11.0093055], [0.199, 0.801]],
    C=[6, -4, [12.0, 13.00335484], [0.9893, 0.0107]],
    N=[7, 5, [14.00307401, 15.00010897], [0.99636, 0.00364]],
    O=[8, -2, [15.99491462, 16.9991315, 17.9991604], [0.99757, 0.00038, 0.00205]],
    F=[9, -1, [18.9984032], [1.0]],
    Ne=[10, 0, [19.99244018, 20.99384668, 21.99138511], [0.9048, 0.0027, 0.0925]],
    Na=[11, 1, [22.98976966], [1.0]],
    Mg=[12, 2, [23.98504187, 24.985837, 25.982593], [0.7899, 0.1, 0.1101]],
    Al=[13, 3, [26.98153863], [1.0]],
    Si=[14, 4, [27.97692649, 28.97649468, 29.97377018], [0.92223, 0.04685, 0.03092]],
    P=[15, 5, [30.97376149], [1.0]],
    S=[16, -2, [31.97207073, 32.97145854, 33.96786687, 35.96708088], [0.9499, 0.0075, 0.0425, 0.0001]],
    Cl=[17, -1, [34.96885271, 36.9659026], [0.7576, 0.2424]],
    Ar=[18, 0, [35.96754511, 37.9627324, 39.96238312], [0.003336, 0.000629, 0.996035]],
    K=[19, 1, [38.9637069, 39.96399867, 40.96182597], [0.932581, 0.000117, 0.067302]],
    Ca=[20, 2, [39.9625912, 41.9586183, 42.9587668, 43.9554811, 45.9536927, 47.952533],
        [0.96941, 0.00647, 0.00135, 0.02086, 4e-05, 0.00187]],
    Sc=[21, 3, [44.9559119], [1.0]],
    Ti=[22, 4, [45.9526316, 46.9517631, 47.9479463, 48.94787, 49.9447912], [0.0825, 0.0744, 0.7372, 0.0541, 0.0518]],
    V=[23, 5, [49.9471585, 50.9439595], [0.0025, 0.9975]],
    Cr=[24, 2, [49.9460442, 51.9405075, 52.9406494, 53.9388804], [0.04345, 0.83789, 0.09501, 0.02365]],
    Mn=[25, 2, [54.9380451], [1.0]],
    Fe=[26, 3, [53.9396147, 55.9349418, 56.9353983, 57.9332801], [0.05845, 0.91754, 0.02119, 0.00282]],
    Co=[27, 2, [58.933195], [1.0]],
    Ni=[28, 2, [57.9353429, 59.9307864, 60.931056, 61.9283451, 63.927966],
        [0.68077, 0.26223, 0.011399, 0.036346, 0.009255]],
    Cu=[29, 2, [62.9295975, 64.9277895], [0.6915, 0.3085]],
    Zn=[30, 2, [63.9291422, 65.9260334, 66.9271273, 67.9248442, 69.9253193],
        [0.4917, 0.2773, 0.0404, 0.1845, 0.0061]],
    Ga=[31, 3, [68.9255736, 70.9247013], [0.60108, 0.39892]],
    Ge=[32, 2, [69.9242474, 71.9220758, 72.9234589, 73.9211778, 75.9214026],
        [0.2057, 0.2745, 0.0775, 0.3650, 0.0773]],
    As=[33, 3, [74.9215965], [1.0]],
    Se=[34, 4, [73.9224764, 75.9192136, 76.919914, 77.9173091, 79.9165213, 81.9166994],
        [0.0089, 0.0937, 0.0763, 0.2377, 0.4961, 0.0873]],
    Br=[35, -1, [78.9183379, 80.916291], [0.5069, 0.4931]],
    Kr=[36, 0, [77.9203648, 79.916379, 81.9134836, 82.914136, 83.911507, 85.91061073],
        [0.00355, 0.02286, 0.11593, 0.115, 0.56987, 0.17279]],
    Rb=[37, 1, [84.91178974, 86.90918053], [0.7217, 0.2783]],
    Sr=[38, 2, [83.913425, 85.9092602, 86.9088771, 87.9056121], [0.0056, 0.0986, 0.07, 0.8258]],
    Y=[39, 3, [88.9058483], [1.0]],
    Zr=[40, 4, [89.9047044, 90.9056458, 91.9050408, 93.9063152, 95.9082734],
        [0.5145, 0.1122, 0.1715, 0.1738, 0.028]],
    Nb=[41, 5, [92.9063781], [1.0]],
    Mo=[42, 6, [91.906811, 93.9050883, 94.9058421, 95.9046795, 96.9060215, 97.9054082, 99.90747],
        [0.1453, 0.0915, 0.1584, 0.1667, 0.0960, 0.2439, 0.0982]],
    Tc=[43, 2, [96.9064], [1.0]],
    Ru=[44, 3, [95.907598, 97.905287, 98.9059393, 99.9042195, 100.9055821, 101.9043493, 103.905433],
        [0.0554, 0.0187, 0.1276, 0.126, 0.1706, 0.3155, 0.1862]],
    Rh=[45, 2, [102.905504], [1.0]],
    Pd=[46, 2, [101.905609, 103.904036, 104.905085, 105.903486, 107.903892, 109.905153],
        [0.0102, 0.1114, 0.2233, 0.2733, 0.2646, 0.1172]],
    Ag=[47, 1, [106.905097, 108.904752], [0.51839, 0.48161]],
    Cd=[48, 2, [105.906459, 107.904184, 109.9030021, 110.9041781, 111.9027578, 112.9044017, 113.9033585, 115.904756],
        [0.0125, 0.0089, 0.1249, 0.128, 0.2413, 0.1222, 0.2873, 0.0749]],
    In=[49, 3, [112.904058, 114.903878], [0.0429, 0.9571]],
    Sn=[50, 4,
        [111.904818, 113.902779, 114.903342, 115.901741, 116.902952, 117.901603, 118.903308, 119.9021947, 121.903439,
         123.9052739], [0.0097, 0.0066, 0.0034, 0.1454, 0.0768, 0.2422, 0.0859, 0.3258, 0.0463, 0.0579]],
    Sb=[51, 3, [120.9038157, 122.904214], [0.5721, 0.4279]],
    Te=[52, 4, [119.90402, 121.9030439, 122.90427, 123.9028179, 124.9044307, 125.9033117, 127.9044631, 129.9062244],
        [0.0009, 0.0255, 0.0089, 0.0474, 0.0707, 0.1884, 0.3174, 0.3408]],
    I=[53, -1, [126.904473], [1.0]],
    Xe=[54, 0, [123.905893, 125.904274, 127.9035313, 128.9047794, 129.903508, 130.9050824, 131.9041535, 133.9053945,
                135.907219],
        [0.000952, 0.00089, 0.019102, 0.264006, 0.04071, 0.212324, 0.269086, 0.104357, 0.088573]],
    Cs=[55, 1, [132.9054519], [1.0]],
    Ba=[56, 2, [129.9063208, 131.9050613, 133.9045084, 134.9056886, 135.9045759, 136.9058274, 137.9052472],
        [0.00106, 0.00101, 0.02417, 0.06592, 0.07854, 0.11232, 0.71698]],
    La=[57, 3, [137.907112, 138.9063533], [0.0008881, 0.9991119]],
    Ce=[58, 3, [135.907172, 137.905991, 139.9054387, 141.909244], [0.00185, 0.00251, 0.8845, 0.11114]],
    Pr=[59, 3, [140.9076528], [1.0]],
    Nd=[60, 3, [141.9077233, 142.9098143, 143.9100873, 144.9125736, 145.9131169, 147.916893, 149.920891],
        [0.27152, 0.12174, 0.23798, 0.08293, 0.17189, 0.05756, 0.05638]],
    Pm=[61, 3, [144.9127], [1.0]],
    Sm=[62, 3, [143.911999, 146.9148979, 147.9148227, 148.9171847, 149.9172755, 151.9197324, 153.9222093],
        [0.0307, 0.1499, 0.1124, 0.1382, 0.0738, 0.2675, 0.2275]],
    Eu=[63, 3, [150.9198502, 152.9212303], [0.4781, 0.5219]],
    Gd=[64, 3, [151.919791, 153.9208656, 154.922622, 155.9221227, 156.9239601, 157.9241039, 159.9270541],
        [0.002, 0.0218, 0.148, 0.2047, 0.1565, 0.2484, 0.2186]],
    Tb=[65, 4, [158.9253468], [1.0]],
    Dy=[66, 3, [155.924283, 157.924409, 159.9251975, 160.9269334, 161.9267984, 162.9287312, 163.9291748],
        [0.00056, 0.00095, 0.02329, 0.18889, 0.25475, 0.24896, 0.2826]],
    Ho=[67, 3, [164.9303221], [1.0]],
    Er=[68, 3, [161.928778, 163.9292, 165.9302931, 166.9320482, 167.9323702, 169.9354643],
        [0.00139, 0.01601, 0.33503, 0.22869, 0.26978, 0.1491]],
    Tm=[69, 3, [168.9342133], [1.0]],
    Yb=[70, 3, [167.933897, 169.9347618, 170.9363258, 171.9363815, 172.9382108, 173.9388621, 175.9425717],
        [0.00123, 0.02982, 0.1409, 0.2168, 0.16103, 0.32026, 0.12996]],
    Lu=[71, 3, [174.9407718, 175.9426863], [0.97401, 0.02599]],
    Hf=[72, 4, [173.940046, 175.9414086, 176.9432207, 177.9436988, 178.9458161, 179.94655],
        [0.0016, 0.0526, 0.186, 0.2728, 0.1362, 0.3508]],
    Ta=[73, 5, [179.9474648, 180.9479958], [0.0001201, 0.9998799]],
    W=[74, 6, [179.946704, 181.9482042, 182.950223, 183.9509312, 185.9543641],
       [0.0012, 0.265, 0.1431, 0.3064, 0.2843]],
    Re=[75, 2, [184.952955, 186.9557531], [0.374, 0.626]],
    Os=[76, 4, [183.9524891, 185.9538382, 186.9557505, 187.9558382, 188.9581475, 189.958447, 191.9614807],
        [0.0002, 0.0159, 0.0196, 0.1324, 0.1615, 0.2626, 0.4078]],
    Ir=[77, 4, [190.960594, 192.9629264], [0.373, 0.627]],
    Pt=[78, 4, [189.959932, 191.961038, 193.9626803, 194.9647911, 195.9649515, 197.967893],
        [0.00012, 0.00782, 0.3286, 0.3378, 0.2521, 0.07356]],
    Au=[79, 3, [196.9665687], [1.0]],
    Hg=[80, 2, [195.965833, 197.966769, 198.9682799, 199.968326, 200.9703023, 201.970643, 203.9734939],
        [0.0015, 0.0997, 0.1687, 0.231, 0.1318, 0.2986, 0.0687]],
    Tl=[81, 1, [202.9723442, 204.9744275], [0.2952, 0.7048]],
    Pb=[82, 2, [203.9730436, 205.9744653, 206.9758969, 207.9766521], [0.014, 0.241, 0.221, 0.524]],
    Bi=[83, 3, [208.9803987], [1.0]],
    Po=[84, 4, [209.0], [1.0]],
    At=[85, 7, [210.0], [1.0]],
    Rn=[86, 0, [220.0], [1.0]],
    Fr=[87, 1, [223.0], [1.0]],
    Ra=[88, 2, [226.0], [1.0]],
    Ac=[89, 3, [227.0], [1.0]],
    Th=[90, 4, [232.0380553], [1.0]],
    Pa=[91, 4, [231.035884], [1.0]],
    U=[92, 6, [234.0409521, 235.0439299, 238.0507882], [5.4e-05, 0.007204, 0.992742]],
    Np=[93, 5, [237.0], [1.0]],
    Pu=[94, 3, [244.0], [1.0]],
    Am=[95, 2, [243.0], [1.0]],
    Cm=[96, 3, [247.0], [1.0]],
    Bk=[97, 3, [247.0], [1.0]],
    Cf=[98, 0, [251.0], [1.0]],
    Es=[99, 0, [252.0], [1.0]],
    Fm=[100, 0, [257.0], [1.0]],
    Md=[101, 0, [258.0], [1.0]],
    No=[102, 0, [259.0], [1.0]],
    Lr=[103, 0, [262.0], [1.0]],
    Rf=[104, 0, [261.0], [1.0]],
    Db=[105, 0, [262.0], [1.0]],
    Sg=[106, 0, [266.0], [1.0]]
    # Ee=[0, 0, [0.000548597], [1.0]]
)
mass_electron = 0.00054857990924


class Element(object):
    """
    An element from the periodic table.
    """

    def __init__(self, id):
        """
        Initializes an Element given some identifier
        :param id: Can be either the element symbol as a string,
        e.g. 'H', 'C', 'Ag' or its atomic number in the periodic table
        """
        if isinstance(id, str):
            try:
                data = tuple(periodic_table[id])
                self._initialize(id, *data)
                # self._name = id
                # self._number = data[0]
                # self._masses = data[1]
                # self._ratios = data[2]
            except KeyError as e:
                raise ValueError("%s is not an element." % id)
        elif isinstance(id, int):
            if id <= 0:
                raise ValueError("%s is not greater than zero." % id)
            if id >= len(periodic_table):
                raise ValueError("There is no element with atomic number %s" % id)
            periodic_table_list = list(periodic_table.items())
            s, data = tuple(periodic_table_list[id])
            self._initialize(s, *data)
        else:
            raise TypeError("id must be either str or int, not " % id.__class__)

    def name(self):
        """
        Return the element symbol as a string.
        """
        return self._name

    def charge(self):
        """
        Return the atomic charge of this element.
        :rtype: int
        """
        return self._charge

    def number(self):
        """
        Return the atomic number of this element in the periodic table.
        :rtype: int
        """
        return self._number

    def masses(self):
        """
        Return the masses of all possible isotopes in ascending order.

        :rtype: sequence
        """
        return self._masses

    def mass_ratios(self):
        """
        Return the probability of each isotope, ordered by the isotope's
        atomic mass.
        :rtype: sequence
        """
        return self._ratios

    def average_mass(self):
        """
        Return the average mass of this element, that is the dot product of its masses and ratios.
        :rtype: float
        """
        return np.dot(self._masses, self._ratios)

    def __eq__(self, other):
        if isinstance(other, self.__class__):
            return self._name == other.name() and self._number == other.number()
        else:
            return NotImplemented

    def __str__(self):
        return self._name

    def __unicode__(self):
        return self.__str__()

    def __repr__(self):
        return self.__class__.__name__ + "(id='%s')" % self.name()

    def _initialize(self, name, number, charge, masses, ratios):
        self._name = name
        self._number = number
        self._charge = charge
        self._masses = masses
        self._ratios = ratios


class FormulaSegment(object):
    """
    A segment from an expanded molecular sum formula.

    A segment is a single element together with its number of occurrences
    within a molecule. For example, the molecule 'H20' would consist of the
    segments ('H', 2) and ('O', 1).
    """

    def __init__(self, element, amount):
        """
        Create a segment given an element and a number.
        :param element: an Element object
        :param amount: a positive non-zero integer
        """
        if not isinstance(amount, int):
            raise TypeError("%s is not an integer." % amount)
        if not amount > 0:
            raise ValueError("number must be greater than 0, but is %s" % amount)
        self._element = element
        self._amount = amount

    def element(self):
        """
        Return the chemical element.
        """
        return self._element

    def amount(self):
        """
        Return the amount of the element.
        """
        return self._amount

    def charge(self):
        """
        The element's charge multiplied by its amount.
        """
        return self._element.charge() * self._amount

    def average_mass(self):
        """
        The element's average mass multiplied by its amount.
        """
        return self._element.average_mass() * self._amount

    def __eq__(self, other):
        if isinstance(other, self.__class__):
            return self._element == other.element() and self._amount == other.amount()
        else:
            return NotImplemented

    def __str__(self):
        if self._amount > 1:
            return "%s%s" % (self._element, self._amount)
        else:
            return str(self._element)

    def __unicode__(self):
        return self.__str__()

    def __repr__(self):
        return "FormulaSegment(element=%s, number=%s)" % (repr(self._element),
                                                          self._amount)


class SumFormula(object):
    """
    A molecular sum formula, built up from FormulaSegments. Use SumFormulaParser
    to parse your string representation into a SumFormula object.

    To get the expanded string representation of this object, use str().
    """

    def __init__(self, segments):
        """
        :param segments: sequence of FormulaSegments
        """
        self._segments = tuple(segments)

    def get_segments(self):
        """
        Return the sequence of segments of which this sum formula consists.
        :rtype: tuple
        """
        return self._segments

    def average_mass(self):
        """
        The sum of the average masses of its segments.
        :rtype: float
        """
        return sum(map(lambda x: x.average_mass(), self._segments))

    def charge(self):
        """
        The sum of the charges of its segments.
        :rtype: int
        """
        return sum(map(lambda x: x.charge(), self._segments))

    def __eq__(self, other):
        if isinstance(other, self.__class__):
            return self._segments == other.get_segments()
        else:
            return NotImplemented

    def __str__(self):
        return ''.join(map(str, self._segments))

    def __unicode__(self):
        return self.__str__()


class SumFormulaParser(object):
    """
    A class to build SumFormula objects from their string representation.

    Alter the parsing behaviour by subclassing and overriding expand() and/or
    make_segments(). parse_string() will just call these two methods in row.
    """

    @classmethod
    def parse_string(cls, sf):
        """
        Convenience method for directly making a SumFormula object from a
        non-expanded string representation of a sum formula. Internally calls
        expand() then make_segments().
        :return: the resulting SumFormula object
        """
        return SumFormula(cls.iter_segments(cls.expand(sf)))

    @classmethod
    def expand(cls, sf):
        """
        Expands ((((M)N)O)P)Q to M*N*O*P*Q. Doesn't do anything if already
        expanded.
        :return: A string representing the sum formula in its expanded form.
        :rtype: str
        """
        while len(re.findall('\(\w*\)', sf)) > 0:
            parenthetical = re.findall('\(\w*\)[0-9]+', sf)
            for i in parenthetical:
                p = re.findall('[0-9]+', str(re.findall('\)[0-9]+', i)))
                j = re.findall('[A-Z][a-z]*[0-9]*', i)
                for n in range(0, len(j)):
                    numero = re.findall('[0-9]+', j[n])
                    if len(numero) != 0:
                        for k in numero:
                            nu = re.sub(k, str(int(int(k) * int(p[0]))), j[n])
                    else:
                        nu = re.sub(j[n], j[n] + p[0], j[n])
                    j[n] = nu
                newphrase = ""
                for m in j:
                    newphrase += str(m)
                sf = sf.replace(i, newphrase)
            if (len((re.findall('\(\w*\)[0-9]+', sf))) == 0) and (len(re.findall('\(\w*\)', sf)) != 0):
                sf = sf.replace('(', '')
                sf = sf.replace(')', '')
        lopoff = re.findall('[A-Z][a-z]*0', sf)
        if lopoff:
            sf = sf.replace(lopoff[0], '')
        return sf

    @classmethod
    def iter_segments(cls, expanded):
        """
        Iterates over an expanded formula to create a sequence of segments.

        :param expanded: Sum formula in its expanded string representation
        :return: An iterator of FormulaSegments
        :rtype: iterator
        """
        segments = re.findall('([A-Z][a-z]*)([0-9]*)', expanded)
        for atom, number in segments:
            number = int(number) if number else 1
            yield FormulaSegment(Element(atom), number)


def single_pattern_fft(segment, threshold=1e-9):
    """
    .. py:function:: single_pattern_fft(segment, [threshold=1e-9])

    Calculates the isotope pattern of a single FormulaSegment using multidimensional fast fourier transform.

    See 'Efficient Calculation of Exact Fine Structure Isotope Patterns via the
    Multidimensional Fourier Transform' (A. Ipsen, 2014).

    :type segment: FormulaSegment
    :param threshold: Only intensities above this threshold will be part of the result. Must be a non-negative number
    :type threshold: float
    :return: the isotopic pattern as a MassSpectrum
    :rtype: MassSpectrum
    """
    if threshold < 0:
        raise ValueError("threshold cannot be negative")
    element, amount = segment.element(), segment.amount()
    iso_mass, iso_abundance = np.asarray(element.masses()), np.asarray(element.mass_ratios())
    res = MassSpectrum()
    if len(iso_abundance) == 1:
        res.add_spectrum(iso_mass * amount, np.array([1.0]))
        return res
    if amount == 1:
        significant = np.where(iso_abundance > threshold)
        res.add_spectrum(iso_mass[significant], iso_abundance[significant])
        return res
    dim = len(iso_abundance) - 1
    abundance = np.zeros([amount + 1] * dim)
    abundance.flat[0] = iso_abundance[0]
    abundance.flat[(amount + 1) ** np.arange(dim)] = iso_abundance[-1:0:-1]
    abundance = np.real(np.fft.ifftn(np.fft.fftn(abundance) ** amount))
    significant = np.where(abundance > threshold)
    intensities = abundance[significant]
    masses = amount * iso_mass[0] + (iso_mass[1:] - iso_mass[0]).dot(significant)
    res.add_spectrum(masses, intensities)
    return res


def trim(y, x):
    """
    .. py:function:: trim(y, x)

    Remove duplicate elements in the second array and sum the duplicate values in the first one.
    This function returns an array containing the unique values from y and an array containing the values from x
    where its elements at the indexes of the duplicate elements in y have been summed.

    Example:

    .. code::
    >>> trim([5, 1, 2, 5], [1, 2, 2, 3])
    (array([ 5.,  3.,  5.]), array([1, 2, 3]))

    :param y: the array from which the values are summed
    :type y: Union[ndarray, Iterable]
    :param x: the array from which the duplicates are removed
    :type x: Union[ndarray, Iterable]
    :return: the trimmed y array and the trimmed x array
    :rtype: Tuple[ndarray]
    """
    x, inv = np.unique(x, return_inverse=True)
    y = np.bincount(inv, weights=y)
    return y, x


def cartesian(rx, mx, threshold=0.0001):
    """
    .. py:function:: cartesian(rx, mx, threshold)

    Combine multiple isotope patterns into a single one.

    :param rx: Sequence of ratio arrays
    :type rx: Sequence[ndarray]
    :param mx: Sequence of mass arrays
    :type mx: Sequence[ndarray]
    :param threshold: threshold below which the resulting ratios are filtered out
    :return: The resulting ratio array and the mass array
    :rtype: Tuple[ndarray]
    """
    ry, my = asarray(rx[0]), asarray(mx[0])
    for i in xrange(1, len(rx)):
        newr = np.outer(rx[i], ry).ravel()
        newm = np.add.outer(mx[i], my).ravel()
        js = np.where(newr > threshold)[0]
        ry, my = newr[js], newm[js]
    return ry, my


##################################################################################
# Does housekeeping to generate final intensity ratios and puts it into a dictionary
##################################################################################
def normalize(m, n, charges, cutoff):
    m, n = np.asarray(m).round(8), np.asarray(n).round(8)
    n *= 100.0 / max(n)
    filter = n > cutoff
    m, n = m[filter], n[filter]
    if charges != 0:
        m -= charges * mass_electron
        m /= abs(charges)
    return m, n


def gen_gaussian(ms, sigma, pts):
    """
    Transform each peak in an isotope pattern into a gaussian curve.

    Each of the curves is scaled up to the intensity value for the corresponding m/z. The output will be on a regular
    grid with pts points, starting from min_mz - 1, up to max_mz + 1, where min_mz is the lowest m/z value and max_mz is
    the highest m/z value. Since each curve is rendered on the same grid, overlapping curves will add up.

    :param ms: the isotope pattern as a MassSpectrum object
    :return: the smoothed pattern
    :rtype: Tuple[ndarray]
    :throws ValueError: if sigma or pts are not greater than 0
    :throws TypeError: if pts is not an integer
    """
    if not isinstance(pts, int):
        raise TypeError("pts must be an integer")
    if min(sigma, pts) <= 0:
        raise ValueError("sigma and pts must be greater than 0")
    mzs, intensities = ms.get_spectrum(source="centroids")
    xvector = np.linspace(min(mzs) - 1, max(mzs) + 1, pts)
    yvector = intensities.dot(exp(-0.5 * (np.add.outer(mzs, -xvector) / sigma) ** 2))
    return xvector, yvector


def gen_approx_gaussian(ms, sigma, pts, n=20):
    """
    Approximate and faster version of gen_gaussian

    :param ms: the isotope pattern as a MassSpectrum object
    :return: the smoothed pattern
    :rtype: Tuple[ndarray]
    :throws ValueError: if sigma or pts are not greater than 0
    :throws TypeError: if pts is not an integer
    """
    if not isinstance(pts, int):
        raise TypeError("pts must be an integer")
    if min(sigma, pts) <= 0:
        raise ValueError("sigma and pts must be greater than 0")
    mzs, intensities = ms.get_spectrum()
    mzs = mzs / sigma
    xvector = np.linspace(min(mzs) - 1.0/sigma, max(mzs) + 1.0/sigma, pts)
    yvector = np.zeros(xvector.shape)
    for mz, intensity in zip(mzs, intensities):
        k = xvector.searchsorted(mz)
        l = max(k - n, 0)
        r = min(k + n + 1, len(xvector))
        yvector[l:r] += intensity * np.exp(-0.5 * (mz - xvector[l:r]) ** 2)
    return xvector * sigma, yvector


def total_points(min_x, max_x, points_per_mz):
    """
    Calculate the number of points for the regular grid based on the full width at half maximum.

    :param min_x: the lowest m/z value
    :param max_x: the highest m/z value
    :param points_per_mz: number of points per fwhm
    :return: total number of points
    :rtype: int
    """
    if min_x > max_x:
        raise ValueError("min_x > max_x")
    if min(min_x, max_x, points_per_mz) <= 0:
        raise ValueError("all inputs must be greater than 0")
    return int((max_x - min_x) * points_per_mz) + 1


def fwhm_to_sigma(min_x, max_x, fwhm):
    """
    When fitting an isotope pattern to a gaussian distribution, this function calculates the standard deviation sigma
    for the gaussian distribution.

    :param min_x: the lowest m/z value
    :param max_x: the highest m/z value
    :param fwhm: the full width at half maximum
    :return: Sigma
    :rtype: float
    :throws ValueError: if min_x > max_x or if not all inputs are greater than 0
    """
    if min_x > max_x:
        raise ValueError("min_x > max_x")
    if min(min_x, max_x, fwhm) <= 0:
        raise ValueError("all inputs must be greater than 0")
    sigma = fwhm / 2.3548200450309493  # approximation of 2*sqrt(2*ln2)
    return sigma


########
# main function#
########
def complete_isodist(sf, sigma=0.001, cutoff_perc=0.1, charge=None, pts_per_mz=10000, centroid_func=gradient,
                     centroid_kwargs=None):
    """
    Wrapper function for applying perfect_pattern, then gen_gaussian and eventually centroid detection.

    :param sf: the sum formula
    :param sigma: Full width at half maximum
    :type sigma: float
    :param cutoff_perc: min percentage of the maximum intensity to return, max value = 100
    :type cutoff_perc: float
    :param charge: charge of the molecule
    :type charge: int
    :param pts_per_mz: Number of points per mz for the regular grid
    :param centroid_func: the centroid function to apply to the isotope pattern or None if no centroid detection
    should be performed. Must have the same signature as centroid_detection.gradient.
    :param centroid_kwargs: dict to pass to centroid_func as optional parameters
    :return:
    """
    ms1 = perfect_pattern(sf, cutoff_perc, charge=charge)
    ms2 = apply_gaussian(ms1, sigma, pts_per_mz)
    if centroid_func:
        centroid_kwargs = centroid_kwargs or {'weighted_bins': 5}
        centroid_kwargs['min_intensity'] = cutoff_perc
        centroided_mzs, centroided_ints, _ = centroid_func(*ms2.get_spectrum(), **centroid_kwargs)
        ms2.add_centroids(centroided_mzs, centroided_ints)
    return ms2


def perfect_pattern(sf, cutoff_perc=0.1, single_pattern_func=single_pattern_fft, charge=None):
    """
    Compute the isotope pattern of a molecule given by its sum formula.

    First applies single_pattern_func to each segment within the sum formula, then combines these individual patterns
    into a single one.

    :param sf: the sum formula
    :type sf: SumFormula
    :param cutoff_perc: min percentage of the maximum intensity to return, max value = 100
    :type cutoff_perc: float
    :param single_pattern_func: the function to compute a single isotope pattern. Must have the same signature as
    single_pattern_fft
    :param charge: charge of the molecule
    :type charge: int
    :return: the combined isotope pattern as a mass spectrum
    :rtype: MassSpectrum
    """
    single_patterns = (single_pattern_func(segment) for segment in sf.get_segments())
    pattern_list = list(p.get_spectrum() for p in single_patterns)
    single_pattern_masses, single_pattern_ratios = zip(*pattern_list)
    combined_ratios, combined_masses = trim(*cartesian(single_pattern_ratios, single_pattern_masses))
    # intensity_filter = combined_ratios > cutoff_perc
    # combined_ratios, combined_masses = combined_ratios[intensity_filter], combined_masses[intensity_filter]
    if charge is None:
        charge = sf.charge()
    normalized_masses, normalized_ratios = normalize(combined_masses, combined_ratios, charge, cutoff_perc)
    ms = MassSpectrum()
    ms.add_centroids(normalized_masses, normalized_ratios)
    return ms


def apply_gaussian(ms_input, sigma, pts_per_mz=10, exact=True):
    """
    Smooth every peak into a gaussian shape using instrument-specific configuration.

    :param ms_input: the mass spectrum
    :type ms_input: MassSpectrum
    :param sigma: sigma parameter for Gaussian. See fwhm_to_sigma
    :type fwhm: float
    :param pts_per_mz: Number of points per one mz unit for the regular grid
    :type pts_per_mz: int
    :param exact: if False, this function may use an approximate implementation
    :return: a new mass spectrum containing the smoothed data in both profile and centroid mode
    """
    if min(sigma, pts_per_mz) <= 0:
        raise ValueError("sigma and pts_per_mz must be greater than 0")
    input_mzs, input_ints = ms_input.get_spectrum(source="centroids")
    ms_output = MassSpectrum()
    pts = total_points(min(input_mzs) - 1, max(input_mzs) + 1, pts_per_mz)
    if exact:
        gauss_mzs, gauss_ints = gen_gaussian(ms_input, sigma, pts)
    else:
        gauss_mzs, gauss_ints = gen_approx_gaussian(ms_input, sigma, pts)
    gauss_ints *= 100.0 / max(gauss_ints)
    ms_output.add_spectrum(gauss_mzs, gauss_ints)
    return ms_output


def str_to_el(str_in):
    import re
    atom_number = re.split('([A-Z][a-z]*)', str_in)
    el = {}
    for atom, number in zip(atom_number[1::2], atom_number[2::2]):
        if number == '':
            number = '1'
        number = int(number)
        if not atom in el:
            el[atom] = number
        else:
            el[atom] += number
    return el


def rm_1bracket(str_in):
    # find first and last brackets
    rb = str_in.index(')')
    lb = str_in[0:rb].rindex('(')

    # check if multiplier after last bracket
    if len(str_in) == rb + 1:  # end of string
        mult = "1"
        mult_idx = 0
    else:
        mult = str_in[rb + 1]
        mult_idx = 1
    if not mult.isdigit():  # not a number
        mult = '1'
        mult_idx = 0
    # exband brackets
    str_tmp = ""
    for m in range(0, int(mult)):
        str_tmp = str_tmp + str_in[lb + 1:rb]
    if lb == 0:
        str_strt = ""
    else:
        str_strt = str_in[0:lb]
    if rb == len(str_in) - 1:
        str_end = ""
    else:
        str_end = str_in[rb + 1 + mult_idx:]
    return str_strt + str_tmp + str_end


def strip_bracket(str_in):
    go = True
    try:
        while go == True:
            str_in = rm_1bracket(str_in)
    except ValueError as e:
        if str(e) != "substring not found":
            raise
    return str_in


def process_sf(str_in):
    import re
    # split_sign
    sub_strings = re.split('([\+-])', str_in)
    if not sub_strings[0] in (('+', '-')):
        sub_strings = ["+"] + sub_strings
    el = {}
    for sign, sf in zip(sub_strings[0::2], sub_strings[1::2]):
        # remove brackets
        str_in = strip_bracket(sf)
        # count elements
        el_ = str_to_el(str_in)
        for atom in el_:
            number = int('{}1'.format(sign)) * el_[atom]
            if not atom in el:
                el[atom] = number
            else:
                el[atom] += number
    return el


def complex_to_simple(str_in):
    el_dict = process_sf(str_in)
    if any([e<0 for e in el_dict.values()]):
        return None
    sf_str = "".join(["{}{}".format(a,el_dict[a]) for a in el_dict if el_dict[a]>0])
    return sf_str