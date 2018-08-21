import * as failFast from 'jasmine-fail-fast';

const jasmineEnv = (jasmine as any).getEnv();
jasmineEnv.addReporter(failFast.init());