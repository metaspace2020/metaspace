# sm-webapp

Web application for browsing results produced by [sm-engine](https://github.com/metaspace2020/sm-engine).

## Installation

* Clone the repository with `--recursive` flag.
* Run `npm install`
* Create `conf.js` (for development) and `conf.prod.js` (for production) using the provided `conf.js.template`
* Run `node deref_schema.js > src/assets/metadata_schema.json` (FIXME: do it through webpack)
* Run `node generate_tours.js` (FIXME: do it through webpack)

## Running in development mode

```bash
NODE_ENV=development nodemon server.js
```

This will take care of hot reloading after both server and client code changes.

## Running in production

First, execute `npm run build` to get the minified bundles in the `dist/` directory.

Then set `NODE_ENV` accordingly and run `server.js`, e.g.
```bash
NODE_ENV=production forever start -l forever.log -o out.log -e err.log -c "nodemon --exitcrash" server.js
```
