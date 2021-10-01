if [[ $# -eq 0 ]] ; then
  echo "Builds and pushes Docker Hub"
  echo "Usage: $0 new_tag"
  echo "e.g. $0 1.8.0 pushes to the official repository at "
  echo "https://hub.docker.com/repository/docker/metaspace2020/metaspace-lithops-ce"
  exit 1
fi

WORKDIR=$PWD
pushd ../../
lithops runtime build -b code_engine -f "$WORKDIR/Dockerfile" "metaspace2020/metaspace-lithops-ce:$1"
popd