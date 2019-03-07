FROM node:8.15.1-alpine

ENV NPM_CONFIG_LOGLEVEL=warn
RUN npm install -g elasticdump forever
RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories &&\
    echo "http://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories &&\
    echo "http://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories

# build-base and python are required because alpine images use musl instead of glibc,
# and graphql's bcrypt dependency doesn't publish prebuilt musl packages
# More info: https://github.com/kelektiv/node.bcrypt.js/wiki/Installation-Instructions#alpine-linux-based-images
RUN apk update && apk add --no-cache postgresql firefox git curl wget bash dbus ttf-freefont tar gzip build-base python
