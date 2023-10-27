if [[ $# -eq 0 ]] ; then
  echo "Builds and pushes to AWS ECR"
  echo "Usage: $0 new_tag"
  exit 1
fi

WORKDIR=$PWD
pushd ../../
docker build -f "$WORKDIR/Dockerfile" -t "metaspace2020/metaspace-aws-ec2:$1" .
docker push "metaspace2020/metaspace-aws-ec2:$1"
popd
