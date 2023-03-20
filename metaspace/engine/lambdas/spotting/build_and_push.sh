#!/bin/bash

# instructions to build an aws image container/version: https://docs.aws.amazon.com/lambda/latest/dg/images-create.html

# Example usage
# ~~~~~~~~~~~~~
# ```
# ./build_and_push.sh <aws repository name i.e 123456789012.dkr.ecr.us-east-1.amazonaws.com>
# i.e ./build_and_push.sh 123456789012.dkr.ecr.us-east-1.amazonaws.com
# ```
# P.S remember to change docker auth to aws one
# edit ~/.docker/config.json and change { "credsStore" : "desktop" } to { "credsStore" : "ecr-login" }

args=${@:-'"%"'}


docker build -t spotting .
docker tag spotting:latest $args/spotting:latest
docker push $args/spotting:latest