FROM node:16.20.0-alpine3.17

RUN apk add --no-cache --virtual .gyp python3 make g++
RUN apk add --no-cache git netcat-openbsd
RUN yarn global add nodemon

WORKDIR /opt/dev/metaspace/metaspace/webapp

ENTRYPOINT [ ]
CMD [ "/sm-webapp/docker-entrypoint.sh" ]
