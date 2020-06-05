# sm-webapp

Web application for browsing results produced by [METASPACE engine](../engine).

## Installation

* Clone the repository
* Run `yarn install`
* Create `src/clientConfig.json` using the provided template (this is used by the frontend)

## Running in development mode

`yarn run dev` will start webpack-dev-server, which will serve and dynamically rebuild client-side code.

## Testing

The tests rely on having a local copy of the GraphQL schema in `tests/utils/graphql-schema.json`.
This file can either be retrieved from the Production server by running `yarn run fetch-prod-graphql-schema`, or
it can be generated from the local code by running `yarn run generate-local-graphql-schema` (you may need to run
`yarn install` in `../graphql` first)

To run the unit tests: `yarn run test`
To run the unit tests automatically whenever code is changed: `yarn run test --watch`
To check code coverage: `yarn run coverage` then open `coverage/lcov-report/index.html`

## Running in production

Run `yarn run build` to build and minify the project. 
The files in the `dist/` directory can then be served by a web server such as nginx.

## Funding

This project is funded from the [European Horizon2020](https://ec.europa.eu/programmes/horizon2020/)
project [METASPACE](http://project.metaspace2020.eu/) (no. 634402),
[NIH NIDDK project KPMP](http://kpmp.org/)
and internal funds of the [European Molecular Biology Laboratory](https://www.embl.org/).

## License

This project is licensed under the [Apache 2.0 license](LICENSE).
