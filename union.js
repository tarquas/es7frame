const unionMaker = (Class) => {
  // After module exporting, please extend Union.desc object with following:
  //   type (optional): a field name, which members get the union circular reference to.
  //   members: dictionary of AutoInit-derived classes to be instantiated with specifying union
  //     and deps in corresponding fields.
  //   deps: dictionary of AutoInits to be initialized at current AutoInit's space.
  //   config: params which initialize 'Union.inst'.

  class Union extends Class {
    static get inst() {
      return this.defaultInstance;
    }

    static get defaultInstance() {
      if (!this.currentInst) {
        const {desc} = this;
        const obj = new this(desc.config || desc.defaultInit);
        this.currentInst = obj;
        const depInsts = {};

        for (const dep in desc.deps) {
          depInsts[dep] = desc.deps[dep].defaultInstance;
        }

        Object.assign(obj, depInsts);
      }

      return this.currentInst;
    }

    async initDeps() {
      await Promise.all(this.depKeys.map(async (dep) => {
        const inst = this[dep];
        inst.dependents[this.instanceId] = true;
        if (!inst) return;
        if (inst.depInit) return;
        inst.depInit = true;
        await inst.ready;
      }));
    }

    async initMembers() {
      const {desc} = this.constructor;

      await Promise.all(this.memberKeys.map(async (member) => {
        const init = {};
        if (desc.type) init[desc.type] = this;
        Object.assign(init, ...this.depKeys.map(key => ({[key]: this[key]})));
        const inst = new desc.members[member](init);
        this[member] = inst;
        inst.dependents[this.instanceId] = true;
        await inst.ready;
      }));
    }

    async init() {
      await super.init();
      const {desc} = this.constructor;

      this.depKeys = Object.keys(desc.deps);
      this.memberKeys = Object.keys(desc.members);

      await this.initDeps();
      await this.initMembers();
    }

    async finish() {
      const {desc, nullAsyncFunc} = this.constructor;

      if (this.memberKeys) {
        await Promise.all(this.memberKeys.map(async (member) => {
          const inst = this[member];
          if (!inst) return;
          const finishFunc = inst.finish;
          inst.finish = nullAsyncFunc;
          await finishFunc.call(inst);
          delete this[member][desc.type];
          delete this[member];
        }));
      }

      await super.finish();
    }
  }

  Union.desc = {
    type: Class.type,
    members: {},
    deps: {},
    defaultInit: {}
  };

  return Union;
};

module.exports = unionMaker;
