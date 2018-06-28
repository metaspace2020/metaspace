const mm = require('marky-mark');

module.exports = function(json) {
  this.cacheable();
  const callback = this.async();

  let tour = JSON.parse(json),
      name = tour.id.split('sm-tour-')[1],
      dir = this.context + '/' + name + '/steps';

  this.addContextDependency(dir);

  let md = mm.parseDirectorySync(dir);
  md.sort((x, y) => x.filename.localeCompare(y.filename));

  tour.steps = [];
  for (let step of md) {
    let s = Object.assign({}, step.meta, {content: step.content});
    tour.steps.push(s);
  }

  // TODO error handling
  callback(null, JSON.stringify(tour));
};
