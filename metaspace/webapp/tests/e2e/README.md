## Running end-to-end tests

Install testcafe globally to run the tests:

```bash
[sudo] npm install -g testcafe
```

Run tests like this:
```bash
testcafe <browser name> <test file>
```

A concrete example:
```bash
testcafe chromium annotations.js --screenshots ./screenshots --screenshots-on-fails
```

## Known issues

Canvas doesn't load images:
https://github.com/DevExpress/testcafe/issues/1398
