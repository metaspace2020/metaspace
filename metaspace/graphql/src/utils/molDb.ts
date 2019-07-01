import fetch from 'node-fetch';
import config from './config';

export const deprecatedMolDBs = new Set([...config.moldbs.deprecated, ...config.moldbs.custom]);

export async function fetchMolecularDatabases() {
  const host = config.services.moldb_service_host,
    resp = await fetch(`http://${host}/v1/databases`),
    body = await resp.json();
  return body['data'];
}
