if [ ! -f .env ]; then
  cp .env.example .env
fi

# copy docker configs from into projects
cp -r sm-mol-db/conf/* ../metaspace/mol-db/conf/
cp -r sm-engine/conf/* ../metaspace/engine/conf/
cp -r sm-graphql/config/* ../metaspace/graphql/config/
cp sm-webapp/config/conf.js ../metaspace/webapp/
cp sm-webapp/config/clientConfig.json ../metaspace/webapp/src/

# set up molecular DB
docker-compose run --rm sm-mol-db /install-dbs.sh
./fetch-mol-images.sh

docker-compose up -d