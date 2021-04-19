WORKDIR=$PWD
pushd ../../
docker build -f "$WORKDIR/Dockerfile" "$@" .
popd