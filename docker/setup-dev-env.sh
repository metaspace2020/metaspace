# set up .env file
cp -n .env.example .env
cp -n docker-compose.yml docker-compose.custom.yml

# copy docker configs into projects if needed
cp -n ../metaspace/engine/conf/config.docker.json ../metaspace/engine/conf/config.json
cp -n ../metaspace/graphql/config/development.docker.js ../metaspace/graphql/config/development.js
cp -n ../metaspace/webapp/src/clientConfig.docker.json ../metaspace/webapp/src/clientConfig.json

# start everything
docker-compose up -d

echo "Waiting 10 seconds for everything to run init scripts..."
sleep 10

# set up ElasticSearch
echo "Creating ElasticSearch index"
docker-compose run --rm api /sm-engine/create-es-index.sh

# re-run postgres init script in case it didn't run correctly the first time
echo "Initializing postgres schema (\"already exists\" errors can be safely ignored)"
docker-compose exec postgres sh /docker-entrypoint-initdb.d/create-sm.sh

# set up molecular DB
echo "Installing molecular databases"
docker-compose run --rm api /sm-engine/install-dbs.sh

# download mol images (Excluded because it's slow and rarely needed)
# echo "Downloading molecule images"
# ./fetch-mol-images.sh

# set up ML Scoring Model
echo "Installing scoring models"
docker-compose run --rm api /sm-engine/install-scoring-model.sh
