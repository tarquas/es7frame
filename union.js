const unionMaker = (Class) => {
  // After module exporting, please extend Union.desc object with following:
  //   type: a field name, which members get the union circular reference to.
  //   members: dictionary of AutoInit-derived classes to be instantiated with specifying union
  //     and deps in corresponding fields.
  //   deps: dictionary of AutoInits to be initialized at current AutoInit's space.
  //   defaultInit: params which initialize defaultInstance.

  class Union extends Class {
    static get defaultInstance() {
      if (!this.currentInst) {
        const desc = this.desc;
        const obj = new this(desc.defaultInit);
        this.currentInst = obj;
        const depInsts = {};

        for (const dep in desc.deps) {
          if (Object.hasOwnProperty.call(desc.deps, dep)) {
            depInsts[dep] = desc.deps[dep].defaultInstance;
          }
        }

        Object.assign(obj, depInsts);
      }

      return this.currentInst;
    }

    async init() {
      await super.init();
      const desc = this.constructor.desc;

      this.memberKeys = [];
      this.depKeys = Object.keys(desc.deps);

      const readiness = [];

      for (const dep of this.depKeys) {
        const inst = this[dep];
        if (inst && !inst[desc.type]) readiness.push(inst.ready);
      }

      for (const member in desc.members) {
        if (Object.hasOwnProperty.call(desc.members, member)) {
          const init = {[desc.type]: this};
          Object.assign(init, ...this.depKeys.map(key => ({[key]: this[key]})));
          const inst = new desc.members[member](init);
          this[member] = inst;
          readiness.push(inst.ready);
          this.memberKeys.push(member);
        }
      }

      await Promise.all(readiness);
    }

    async finish() {
      const desc = this.constructor.desc;
      const readiness = [];

      for (const member in desc.members) {
        if (Object.hasOwnProperty.call(desc.members, member)) {
          const inst = this[member];
          const finishFunc = inst.finish;
          inst.finish = Union.nullAsyncFunc;
          const ready = finishFunc.call(inst);
          readiness.push(ready);
          delete this[member][desc.type];
          delete this[member];
        }
      }

      await Promise.all(readiness);
      await super.finish();
    }
  }

  Union.desc = {};
  return Union;
};

module.exports = unionMaker;
