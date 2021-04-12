from setuptools import setup, find_packages

from sm.engine import __version__

setup(
    name='sm',
    version=__version__,
    description='High throughput molecules annotation for imaging mass spectrometry data sets',
    url='https://github.com/metaspace2020/metaspace/tree/master/metaspace/engine',
    author='Alexandrov Team, EMBL',
    author_email='vitaly.kovalev@embl.de',
    packages=find_packages(),
    install_requires=[],
)
