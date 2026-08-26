// Jest 25's bundled module resolver predates Node's `node:` module-prefix
// convention and, even after stripping the prefix, doesn't recognize
// `util/types` as one of Node's builtin submodules (its core-module list is
// older than that submodule's addition). `config@^4.4.2`'s lib/defer.js does
// `require('node:util/types')` at module-load time, which crashes Jest's
// resolver before any test runs.
//
// This shim gives the `^node:util/types$` moduleNameMapper entry (see
// package.json "jest" config) a real file to resolve to, sidestepping the
// resolver's builtin-module detection entirely. It re-exports the same
// object Node itself returns for `require('util/types')` / `util.types`.
module.exports = require('util').types
