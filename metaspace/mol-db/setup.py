from setuptools import setup, find_packages

from app import __version__

setup(
    name='mol_db',
    version=__version__,
    description='Molecular Database RESTful Web API',
    url='https://github.com/intsco/sm-molecular-db.git',
    author='Alexandrov Team, EMBL',
    author_email='vitaly.kovalev@embl.de',
    packages=find_packages(),
    install_requires=[
        "falcon>=2.0,<3.0",
        "sqlalchemy>=1.1.5",
        "gunicorn>=19.1.0",
        "psycopg2>=2.6.2",
        "pandas>=0.25.3",
        "cpyMSpec>=0.3.4",
        "pyMSpec>=0.1.2",
    ],
)
