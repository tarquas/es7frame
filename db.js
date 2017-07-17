const AutoInit = require('./auto-init');
const mongoose = require('mongoose');

mongoose.Promise = Promise;

class Db extends AutoInit {
  // connString : MongoDB connection string
  // connOpts [optional] : MongoDB connection options
  // prefix [optional] : prefix to collections

  constructor(setup) {
    super(setup);
    if (!this.connString) throw new Error('MongoDB Connection string is not specified');
    if (!this.connOpts) this.connOpts = {};
    if (!this.prefix) this.prefix = '';
  }

  async init() {
    await super.init();

    await new Promise((resolve, reject) => {
      this.conn = mongoose.createConnection(
        this.connString,
        this.connOpts,
        (err, res) => (err ? reject(err) : resolve(res))
      );
    });

    this.common = Db.common;
  }

  async finish() {
    this.conn.close();
    await super.finish();
  }
}

Db.common = mongoose;

module.exports = Db;
