const AutoInit = require('./auto-init');

class Multi extends AutoInit {
  constructor(setup) {
    super(setup);
    this.stay = true;
  }

  static async runInstance(inst, args) {
    if (inst && inst[AutoInit.isAsync] && inst.main) {
      await inst.main(...args);
    }
  }

  async main(...args) {
    for (const key of this.memberKeys) {
      const inst = this[key];
      await this.constructor.runInstance(inst, args); // eslint-disable-line
    }
  }
}

module.exports = Multi;
