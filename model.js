const AutoInit = require('./auto-init');
const Crypt = require('./crypt');

class Model extends AutoInit {
  // db -- database (class Db) connection

  constructor(setup) {
    super(setup);
    this.Schema = this.db.common.Schema;
    this.errors = Model.errors;
  }

  async init() {
    await super.init();
    const schema = this.schema;
    this._schema = schema;
    const collection = schema.options.collection;
    if (this.db.prefix) schema.options.collection = `${this.db.prefix}${collection}`;
    let name = this.name;
    if (!name) this.name = name = collection;
    this.model = this.db.conn.model(name, schema);
  }

  newObjectId() {
    const objectId = new this.db.common.Types.ObjectId();
    return objectId;
  }

  newShortId() {
    const objectId = this.newObjectId();
    const shortId = this.toShortId(objectId);
    return shortId;
  }

  toShortId(objectId) {
    const hex = objectId.toString().padStart(24, '0');
    const base64 = new Buffer(hex, 'hex').toString('base64');
    const shortId = Crypt.toUrlSafe(base64);
    return shortId;
  }

  fromShortId(shortId) {
    const base64 = Crypt.fromUrlSafe(shortId);
    const hex = new Buffer(base64, 'base64').toString('hex');
    const objectId = new this.db.common.Types.ObjectId(hex);
    return objectId;
  }
}

Model.errors = {
  duplicate: 11000
};

module.exports = Model;
