if [[ $# -eq 0 ]] ; then
  echo "Builds and pushes to AWS ECR"
  echo "Usage: $0 new_tag"
  exit 1
fi

WORKDIR=$PWD
pushd ../../
lithops runtime build -b aws_lambda -f "$WORKDIR/Dockerfile" "metaspace-aws-lambda:$1"
popd
