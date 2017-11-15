const AutoInit = require('./auto-init');
const Crypt = require('./crypt');
const mongoose = require('mongoose');

mongoose.Promise = Promise;

class Db extends AutoInit {
  // connString : MongoDB connection string
  // connOpts [optional] : MongoDB connection options
  // prefix [optional] : prefix to collections

  static newObjectId() {
    const objectId = this.common.Types.ObjectId();
    return objectId;
  }

  newObjectId(...args) {
    return this.constructor.newObjectId(...args);
  }

  static newShortId() {
    const objectId = this.newObjectId();
    const shortId = this.toShortId(objectId);
    return shortId;
  }

  newShortId(...args) {
    return this.constructor.newShortId(...args);
  }

  static toShortId(objectId) {
    const hex = objectId.toString().padStart(24, '0');
    const base64 = Buffer.from(hex, 'hex').toString('base64');
    const shortId = Crypt.toUrlSafe(base64);
    return shortId;
  }

  toShortId(...args) {
    return this.constructor.toShortId(...args);
  }

  static fromShortId(shortId) {
    const base64 = Crypt.fromUrlSafe(shortId);
    const hex = Buffer.from(base64, 'base64').toString('hex');
    const objectId = new this.db.common.Types.ObjectId(hex);
    return objectId;
  }

  fromShortId(...args) {
    return this.constructor.fromShortId(...args);
  }

  async init() {
    await super.init();
    this.common = this.constructor.common;

    if (!this.connString) throw new Error('MongoDB Connection string is not specified');
    if (!this.connOpts) this.connOpts = {ssl: true};
    if (!this.prefix) this.prefix = '';

    Object.assign(this.connOpts, {
      useMongoClient: true,
      autoReconnect: true,
      bufferMaxEntries: 0
    });

    this.conn = await this.common.createConnection(
      this.connString,
      this.connOpts
    );
  }

  async finish() {
    if (!this.conn) return;
    this.conn.close();
    this.conn = null;
    await super.finish();
  }
}

Db.common = mongoose;

module.exports = Db;
