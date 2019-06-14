import fetch from 'node-fetch';
import config from './config';

export const deprecatedMolDBs = new Set([
  'HMDB', 'ChEBI', 'LIPID_MAPS', 'SwissLipids', 'COTTON_HMDB', 'HMDB-v2.5', 'HMDB-v2.5-cotton',
  // EMBL-dev1/2 aren't actually deprecated. Their inclusion in this list is just for hiding them from normal users in the UI
  'EMBL-dev1', 'EMBL-dev2',
]);

export async function fetchMolecularDatabases() {
  const host = config.services.moldb_service_host,
    resp = await fetch(`http://${host}/v1/databases`),
    body = await resp.json();
  return body['data'];
}
