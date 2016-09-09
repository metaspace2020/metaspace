#!/usr/bin/env bash
brew uninstall --force brew-cask # just in case; Dec 2015 change in homebrew
brew update
brew cask install java
brew install git wget postgresql

nohup postgres -D /usr/local/var/postgres >postgres.stdout 2>&1 &
sleep 5
createuser sm
createdb sm
wget https://raw.githubusercontent.com/SpatialMetabolomics/sm-engine/master/scripts/create_schema.sql
wget https://s3-eu-west-1.amazonaws.com/sm-engine/hmdb_agg_formula.sql
psql -U sm < create_schema.sql
psql -U sm < hmdb_agg_formula.sql
rm *.sql

export SPARK_DIR=spark-1.6.0-bin-hadoop2.6
wget -qO - `wget -qO - http://www.apache.org/dyn/closer.lua?preferred=true`/spark/spark-1.6.0/$SPARK_DIR.tgz | tar xz

wget https://repo.continuum.io/miniconda/Miniconda-latest-MacOSX-x86_64.sh
sh Miniconda-latest-MacOSX-x86_64.sh -b
export PATH=~/miniconda2/bin:$PATH
conda create -y -q -n sm_engine -c https://conda.binstar.org/menpo -c salford_systems matplotlib-nogui scipy numba==0.22.1 pytest mock Fabric lxml psycopg2 opencv3 >conda.stdout
source activate sm_engine
pip install py4j==0.9 tornado==4.2.1 && pip install --no-deps pyimzML==1.0.1 tornpsql==1.1.0

git clone --recursive https://github.com/SpatialMetabolomics/sm-engine.git

