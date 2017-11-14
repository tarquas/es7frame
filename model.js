const AutoInit = require('./auto-init');

class Model extends AutoInit {
  // db -- database (class Db) connection

  async init() {
    await super.init();

    this.Schema = this.db.common.Schema;
    this.errors = this.constructor.errors;

    const {schema} = this;
    this._schema = schema;
    const {collection} = schema.options;
    if (this.db.prefix) schema.options.collection = `${this.db.prefix}${collection}`;
    let {name} = this;
    if (!name) this.name = name = collection;
    this.model = this.Model = this.db.conn.model(name, schema);
  }

  newObjectId() {
    const objectId = this.db.newObjectId();
    return objectId;
  }

  newShortId() {
    const shortId = this.db.newShortId();
    return shortId;
  }

  toShortId(objectId) {
    const shortId = this.db.toShortId(objectId);
    return shortId;
  }

  fromShortId(shortId) {
    const objectId = this.db.fromShortId(shortId);
    return objectId;
  }
}

Model.errors = {
  duplicate: 11000
};

module.exports = Model;
