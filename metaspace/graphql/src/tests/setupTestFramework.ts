// jasmine-fail-fast should not usually be needed because transaction isolation should prevent cascades of failing tests,
// but this may be useful to keep aroundor make into a config option.

// import * as failFast from 'jasmine-fail-fast';
//
// const jasmineEnv = (jasmine as any).getEnv();
// jasmineEnv.addReporter(failFast.init());

// Mock out libraries/files that connect to external services
jest.mock('amqplib', () => ({ connect: () => new Promise(() => null) }))
jest.mock('aws-sdk')
jest.mock('@elastic/elasticsearch')
jest.mock('../utils/smApi/datasets')
jest.mock('../utils/smApi/databases')
jest.mock('../utils/smApi/smApiCall')
jest.mock('../utils/sendEmail')
