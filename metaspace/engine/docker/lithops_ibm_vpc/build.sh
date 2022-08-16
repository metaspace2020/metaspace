if [[ $# -eq 0 ]] ; then
  echo "Builds a docker image"
  echo "Usage: $0 new_tag"
  exit 1
fi

WORKDIR=$PWD
pushd ../../
docker build -f "$WORKDIR/Dockerfile" -t "metaspace2020/metaspace-lithops:$1" .
popd