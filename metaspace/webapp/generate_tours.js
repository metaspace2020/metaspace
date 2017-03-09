const fs = require('fs'),
      mm = require('marky-mark');

function generateTour(name) {
  let md = mm.parseDirectorySync(__dirname + '/src/tours/' + name + '/steps');

  let steps = [];
  for (let step of md) {
    steps.push(Object.assign({}, step.meta, {content: step.content}));
  }

  let tour = {
    id: 'sm-tour-' + name,
    bubbleWidth: 400,
    steps
  };

  fs.writeFile(__dirname + '/src/tours/' + name + '.json',
               JSON.stringify(tour, null, 2),
               err => {
                 if (err) throw err;
                 console.log(`Generated tours/${name}.json`);
               });
}

for (let name of ['basic'])
  generateTour(name);
