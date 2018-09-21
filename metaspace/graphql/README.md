# sm-graphql

GraphQL interface to SM engine

## Development setup

0. Copy `config.json.template` to `config.json` and edit credentials to match your SM engine installation.
1. `yarn install`
2. `node deref_schema.js > metadata_schema.json`
3. `yarn run gen-binding` to generate `src/binding.ts`, which contains the TypeScript types for the GraphQL schema.
4. Run `yarn run dev`, it will automatically restart Node.JS server when the code changes.
5. Open `localhost:3010/graphql` in the browser to play with queries.

## Funding

This project is funded from the [European Horizon2020](https://ec.europa.eu/programmes/horizon2020/)
project [METASPACE](http://project.metaspace2020.eu/) (no. 634402),
[NIH NIDDK project KPMP](http://kpmp.org/)
and internal funds of the [European Molecular Biology Laboratory](https://www.embl.org/).

## License

This project is licensed under the [Apache 2.0 license](LICENSE).

