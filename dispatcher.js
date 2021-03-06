const AutoInit = require('./auto-init');

class Dispatcher extends AutoInit {
  // mq -- message queue (class Mq) instance

  static get type() { return 'dispatcher'; }

  async addHandler(action, customHandler) {
    const [ents, socket, queue] = action.match(this.constructor.rxSocketQueue) || [];
    if (!ents) return;
    const handler = customHandler || this[action];
    const func = this.mq[socket.toLowerCase()];
    if (!func) return;
    const handlerId = await func.call(this.mq, queue, handler.bind(this));
    this.handlers[action] = handlerId;
  }

  async removeHandler(action) {
    const handlerId = this.handlers[action];
    if (handlerId == null) return;
    await this.mq.unhandle(handlerId);
    delete this.handlers[action];
  }

  async removeAllHandlers() {
    for (const action in this.handlers) {
      if (Object.hasOwnProperty.call(this.handlers, action)) {
        await this.removeHandler(action); // eslint-disable-line
      }
    }
  }

  async init() {
    await super.init();
    this.handlers = {};

    for (const action of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      await this.addHandler(action); // eslint-disable-line
    }
  }

  async finish() {
    await this.removeAllHandlers();
    await super.finish();
  }
}

Dispatcher.rxSocketQueue = /^(\w+)\s+(\S+)$/;

module.exports = Dispatcher;
