/**
 * Created by intsco on 5/11/17.
 */

const request = require('request-promise'),
  config = require('config');

function graphqlQuery(query) {
  return request({
    method: 'POST',
    baseUrl : `http://localhost:${config.port}`,
    uri : '/graphql',
    body: {
      query : query.replace(/\n/g, ' ')
    },
    resolveWithFullResponse: true,
    json: true
  })
}

function stripUrls(obj) {
  for (let k in obj) {
    if (obj[k] !== null && (typeof obj[k] == 'object' || obj[k] instanceof Array))
      obj[k] = stripUrls(obj[k]);
    else if (typeof obj[k] == 'string' && obj[k].startsWith('http')) {
      obj[k] = obj[k].replace(/http:\/\/[^:\/]+:?[\d]*/g, '')
    }
  }
  return obj;
}

module.exports = {graphqlQuery, stripUrls};