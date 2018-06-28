var { defineSupportCode } = require('cucumber');
const testControllerHolder = require('./testControllerHolder');

function CustomWorld () {
  this.waitForTestController = testControllerHolder.get;
}

defineSupportCode(function ({ setWorldConstructor }) {
  setWorldConstructor(CustomWorld)
});
