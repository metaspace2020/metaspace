# set up .env file
cp -n .env.example .env
cp -n docker-compose.yml docker-compose.custom.yml

# copy docker configs into projects if needed
cp -n ../metaspace/engine/conf/config.docker.json ../metaspace/engine/conf/config.json
cp -n ../metaspace/graphql/config/development.docker.js ../metaspace/graphql/config/development.js
cp -n ../metaspace/webapp/src/clientConfig.docker.json ../metaspace/webapp/src/clientConfig.json

# Start everything
docker-compose up -d


# set up molecular DB
docker-compose run --rm api /sm-engine/install-dbs.sh

# download mol images (Excluded because it's slow and rarely needed)
# ./fetch-mol-images.sh

# set up ML Scoring Model
docker-compose run --rm api /sm-engine/install-scoring-model.sh
