const unionMaker = ({
  Class, // a Class to convert to union by extending it with members and dependencies.
  type, // a field name, which members get the union circular reference to.
  members = {}, // dictionary of AutoInit-derived classes to be instantiated with specifying union
  // and deps in corresponding fields.
  deps = {}, // dictionary of instances to be initialized at AutoInit's space.
  defaultInit = {} // params which initialize defaultInstance.
}) => class Union extends Class {
  static get defaultInstance() {
    if (!this.currentInst) {
      const obj = new this(defaultInit);
      Object.assign(obj, deps);
      this.currentInst = obj;
    }

    return this.currentInst;
  }

  async init() {
    await super.init();

    this.memberKeys = [];
    this.depKeys = Object.keys(deps);
    const readiness = this.depKeys.map(dep => (this[dep] && this[dep].ready));

    for (const member in members) {
      if (Object.hasOwnProperty.call(members, member)) {
        const init = {[type]: this};
        Object.assign(init, ...this.depKeys.map(key => ({[key]: this[key]})));
        const inst = new members[member](init);
        this[member] = inst;
        readiness.push(inst.ready);
        this.memberKeys.push(member);
      }
    }

    await Promise.all(readiness);
  }

  async finish() {
    const readiness = [];

    for (const member in members) {
      if (Object.hasOwnProperty.call(members, member)) {
        const ready = this[member].finish();
        readiness.push(ready);
        delete this[member][type];
        delete this[member];
      }
    }

    await Promise.all(readiness);
    await super.finish();
  }
};

module.exports = unionMaker;
