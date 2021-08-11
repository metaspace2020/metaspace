if [[ $# -eq 0 ]] ; then
  echo "Builds and pushes Docker Hub"
  echo "Usage: $0 new_tag"
  echo "e.g. $0 1.8.0 pushes to the official repository at "
  echo "https://hub.docker.com/repository/docker/metaspace2020/metaspace-lithops-ce"
  exit 1
fi

LITHOPS_VERSION="2.4.1"
WORKDIR=$PWD

# download lithops and create lithops_codeengine archive
curl -L https://github.com/lithops-cloud/lithops/archive/refs/tags/$LITHOPS_VERSION.zip -o "$WORKDIR/lithops.zip"
unzip lithops.zip "lithops-$LITHOPS_VERSION/lithops/*"
mv "lithops-$LITHOPS_VERSION" lithops_codeengine
cp "$WORKDIR/lithops_codeengine/lithops/serverless/backends/code_engine/entry_point.py" "$WORKDIR/lithops_codeengine/lithopsentry.py"
cd "$WORKDIR/lithops_codeengine"
zip -r "$WORKDIR/lithops_codeengine.zip" ./*
cd $WORKDIR

# build and push a Docker image
cp "$WORKDIR/../../requirements.txt" .
docker build -f "$WORKDIR/Dockerfile" -t "metaspace2020/metaspace-lithops-ce:$1" .
docker push "metaspace2020/metaspace-lithops-ce:$1"

# cleaning up
rm -rf "$WORKDIR/lithops_codeengine"
rm "$WORKDIR/lithops_codeengine.zip" "$WORKDIR/lithops.zip"
rm "$WORKDIR/requirements.txt"