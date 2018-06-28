source .env

DOCKER_DIR=$(pwd)
# clone projects in parent directory
pushd $DEV_ROOT
git clone --recurse-submodules --branch $MOL_DB_BRANCH $MOL_DB_REPO sm-molecular-db
git clone --recurse-submodules --branch $SM_ENGINE_BRANCH $SM_ENGINE_REPO sm-engine
git clone --recurse-submodules --branch $SM_GRAPHQL_BRANCH $SM_GRAPHQL_REPO sm-graphql
git clone --recurse-submodules --branch $SM_WEBAPP_BRANCH $SM_WEBAPP_REPO sm-webapp

# copy configs from into projects
cp -r "${DOCKER_DIR}"/mol-db/config/* ./sm-molecular-db/conf/
cp -r "${DOCKER_DIR}"/sm-engine/conf/* ./sm-engine/conf/
cp -r "${DOCKER_DIR}"/sm-graphql/config/* ./sm-graphql/config/
cp "${DOCKER_DIR}"/sm-webapp/config/conf.js ./sm-webapp/
cp "${DOCKER_DIR}"/sm-webapp/config/clientConfig.json ./sm-webapp/src/

popd

# set up molecular DB
docker-compose run --rm mol-db /install-dbs.sh
./fetch-mol-images.sh

docker-compose up -d