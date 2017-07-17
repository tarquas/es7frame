const AutoInit = require('./auto-init');

class Model extends AutoInit {
  // db -- database (class Db) connection

  constructor(setup) {
    super(setup);
    this.Schema = setup.db.common.Schema;
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
}

module.exports = Model;
