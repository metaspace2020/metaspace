# NOTE: This is only needed for updating the CircleCI docker image
# It's not used at all for the development docker setup

if [[ $# -eq 0 ]] ; then
  echo "Builds and pushes to Docker Hub"
  echo "Usage: $0 new_tag"
  echo "e.g. $0 1.8.0 pushes to the official repository at "
  echo "https://hub.docker.com/repository/docker/metaspace2020/sm-engine"
  exit 1
fi

WORKDIR=$PWD
pushd ../../
docker build -f "$WORKDIR/Dockerfile" -t "metaspace2020/sm-engine:$1" .
docker push "metaspace2020/sm-engine:$1"
popd