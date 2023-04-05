FROM node:18.15.0-alpine3.16

ENV NPM_CONFIG_LOGLEVEL=warn
RUN npm install -g elasticdump forever
RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories &&\
    echo "http://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories &&\
    echo "http://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories

RUN apk update && apk add --no-cache postgresql git curl wget bash tar gzip
