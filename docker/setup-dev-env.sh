# set up .env file
cp -n .env.example .env

# copy docker configs into projects if needed
cp -nr sm-mol-db/conf/* ../metaspace/mol-db/conf/
cp -nr sm-engine/conf/* ../metaspace/engine/conf/
cp -nr sm-graphql/config/* ../metaspace/graphql/config/
cp -n sm-webapp/config/conf.js ../metaspace/webapp/
cp -n sm-webapp/config/clientConfig.json ../metaspace/webapp/src/

# set up molecular DB
docker-compose run --rm sm-mol-db /install-dbs.sh
./fetch-mol-images.sh

docker-compose up -d