from setuptools import setup, find_packages

setup(
    name='postprocessing-server',
    version='0.1.0',
    description='Umbrella HTTP server for METASPACE postprocessing services',
    url='https://github.com/metaspace2020/metaspace',
    author='METASPACE Team',
    packages=find_packages(),
    python_requires='>=3.8',
    install_requires=['bottle'],
)
