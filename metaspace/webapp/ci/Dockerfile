FROM node:8.9.1-alpine

ENV NPM_CONFIG_LOGLEVEL=warn
RUN npm install -g elasticdump forever
RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories &&\
    echo "http://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories &&\
    echo "http://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories

RUN apk update && apk add --no-cache postgresql firefox git curl wget bash dbus ttf-freefont tar gzip
