brew update
brew cask install java
brew install git wget postgresql
# mkdir -p ~/Library/LaunchAgents
# ln -sfv /usr/local/opt/postgresql/*.plist ~/Library/LaunchAgents
# launchctl load ~/Library/LaunchAgents/homebrew.mxcl.postgresql.plist

# install Spark
cd $HOME
export SPARK_DIR=spark-1.6.0-bin-hadoop2.6
wget -O - https://www.apache.org/dyn/closer.lua?path=spark/spark-1.6.0/$SPARK_DIR.tgz | tar xz

# install Python and necessary packages
wget https://repo.continuum.io/miniconda/Miniconda-latest-MacOSX-x86_64.sh
sh Miniconda-latest-MacOSX-x86_64.sh -b
export PATH=~/miniconda2/bin:$PATH
conda create -y -n sm_distributed -c https://conda.binstar.org/menpo -c salford_systems matplotlib-nogui scipy numba==0.22.1 pytest mock Fabric lxml psycopg2 opencv3
source activate sm_distributed
pip install py4j==0.9 tornado==4.2.1 && pip install --no-deps pyimzML==1.0.1 tornpsql==1.1.0

# clone the repository
git clone --recursive https://github.com/SpatialMetabolomics/SM_distributed.git
cd SM_distributed

# setup the database (with no password)
createuser sm
createdb sm
psql -U sm < scripts/create_schema.sql
wget -O scripts/hmdb_agg_formula.sql https://s3-eu-west-1.amazonaws.com/sm-engine/hmdb_agg_formula.sql
psql -U sm < scripts/hmdb_agg_formula.sql
