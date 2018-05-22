FROM node

WORKDIR /opt/sm-graphql

ARG sm_branch=master

RUN git clone --recurse-submodules --branch "$sm_branch" https://github.com/METASPACE2020/sm-graphql.git .

RUN yarn install

RUN yarn global add nodemon

RUN node deref_schema.js > metadata_schema.json

COPY docker-entrypoint.sh /

ENTRYPOINT [ ]
CMD [ "/docker-entrypoint.sh" ]
