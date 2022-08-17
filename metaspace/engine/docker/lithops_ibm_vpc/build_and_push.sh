if [[ $# -eq 0 ]] ; then
  echo "Builds and pushes Docker Hub"
  echo "Usage: $0 new_tag"
  echo "e.g. $0 1.8.0 pushes to the official repository at "
  echo "https://hub.docker.com/repository/docker/metaspace2020/metaspace-lithops"
  exit 1
fi

WORKDIR=$PWD
pushd ../../
docker build -f "$WORKDIR/Dockerfile" -t "metaspace2020/metaspace-lithops:$1" .
docker push "metaspace2020/metaspace-lithops:$1"
popd