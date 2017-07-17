const Async = require('./async');

class AutoInit extends Async {
  constructor(setup) {
    super();
    Object.assign(this, setup);
  }
}

module.exports = AutoInit;
