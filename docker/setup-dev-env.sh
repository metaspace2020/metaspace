# set up .env file
cp -n .env.example .env

# copy docker configs into projects if needed
cp -n ../metaspace/engine/conf/config.docker.json ../metaspace/engine/conf/config.json
cp -n ../metaspace/graphql/config/development.docker.js ../metaspace/graphql/config/development.js
cp -n ../metaspace/webapp/src/clientConfig.docker.json ../metaspace/webapp/src/clientConfig.json

# Start everything
docker-compose up -d


# set up molecular DB

# This is currently broken as the databases no longer pass validation
# docker-compose run --rm api /sm-engine/install-dbs.sh

# Mol images
# ./fetch-mol-images.sh