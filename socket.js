const AutoInit = require('./auto-init');
const socketIo = require('socket.io');
const amqpAdapter = require('./socket-mq');
const util = require('util');

class Socket extends AutoInit {
  async error(err, {action}) {
    const now = new Date().toISOString();

    if (!this.errorSilent) {
      console.log(`>>> ${now} @ WEBSOCKET ${action}\n\n${err.stack || err}`);
    }
  }

  async SUB(handler, {action}, ...args) {
    try {
      await handler.call(this, ...args);
    } catch (err) {
      await this.error(err, {action});
    }
  }

  static rpcMakeError(err) {
    if (err instanceof Error) {
      const encErr = {message: err.message, isError: true};
      return {error: encErr};
    }

    return {error: err};
  }

  async rpc(event, ...args) {
    const result = await new Promise((resolve, reject) => {
      try {
        this.socket.emit(event, args, resolve);
      } catch (err) {
        reject(err);
      }
    });

    if (!result) return result;
    if (result.error) throw result.error;
    return result.data;
  }

  async RPC(handler, {event, action}, ...args) {
    let result;

    try {
      result = {data: await handler.call(this, ...args)};
    } catch (err) {
      result = this.constructor.rpcMakeError(err);
      await this.error(err, {action});
    }

    try {
      await this.rpc(event, result);
    } catch (err) {
      // ignore
    }
  }

  addHandler(method, nsp, event, handler) {
    const action = `${method} ${event} ${nsp || '/'}`;
    if (this.subscriptions[action]) throw new Error('Multiple subscriptions to same event not allowed');

    const bound = function actionHandler(...args) {
      this[method].call(this, handler, {event, action}, ...args);
    };

    this.subscriptions[action] = {nsp, event, handler: bound};
    return bound;
  }

  addSubscription(action, customHandler) {
    const [matched, method, event, , nsp] = action.match(this.constructor.rxSocketSub) || [];
    if (!matched) return;
    const handler = customHandler || this[action];
    this.addHandler(method.toUpperCase(), nsp, event, handler);
  }

  addSubscriptions() {
    for (const action of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      this.addSubscription(action);
    }
  }

  removeSubscription(action) {
    const sub = this.subscriptions[action];
    if (!sub) return false;
    sub.p.removeListener(sub.event, sub.handler);
    delete this.subscriptions[action];
    return true;
  }

  removeSubscriptions() {
    for (const action in this.subscriptions) {
      if (Object.hasOwnProperty.call(this.subscriptions, action)) {
        this.removeSubscription(action);
      }
    }
  }

  getNspContext(nsp) {
    if (!nsp) return this.socket;
    return this.socket.of(nsp);
  }

  attachSubscription(action) {
    const sub = this.subscriptions[action];
    const nspCtx = this.getNspContext(sub.nsp);
    const handler = sub.handler.bind(this);
    nspCtx.on(sub.event, handler);
    this.socketSubs[action] = handler;
  }

  attachSubscriptions() {
    for (const action in this.subscriptions) {
      if (Object.hasOwnProperty.call(this.subscriptions, action)) {
        this.attachSubscription(action);
      }
    }
  }

  detachSubscription(action) {
    const sub = this.subscriptions[action];
    const handler = this.socketSubs[action];
    const nspCtx = this.getNspContext(sub.nsp);
    nspCtx.removeListener(sub.event, handler);
    delete this.socketSubs[action];
  }

  detachSubscriptions() {
    for (const action in this.socketSubs) {
      if (Object.hasOwnProperty.call(this.socketSubs, action)) {
        this.detachSubscription(action);
      }
    }
  }

  async connect() {
  }

  get room() { return null; }

  async onConnection(socket) {
    const context = Object.create(this);

    Object.assign(context, {
      socket,
      onDisconnect: this.onDisconnection.bind(context),
      socketSubs: {}
    });

    context.attachSubscriptions();
    socket.on('disconnect', context.onDisconnect);

    try {
      await context.connect({
        query: socket.request._query,
        headers: socket.request.headers
      });
    } catch (err) {
      socket.emit('connectError', this.constructor.rpcMakeError(err));
      socket.disconnect(true);
    }
  }

  async disconnect() {
  }

  async onDisconnection() {
    await this.disconnect();
    this.socket.removeListener('disconnect', this.onDisconnect);
    this.detachSubscriptions();
    this.socket.removeAllListeners();
    delete this.socket;
    delete this.onDisconnect;
    delete this.socketSubs;
  }

  get endpoint() { return '/socket'; }

  attachToServers(io) {
    if (this.web.http) io.attach(this.web.http);
    if (this.web.https && this.web.https !== this.web.http) io.attach(this.web.https);
  }

  async init() {
    await super.init();
    const endpoint = this.endpoint;

    const binds = this.web.constructor.binds;
    const bind = `WEBSOCKET ${endpoint}`;
    let io = binds[bind];

    if (!io) {
      this.primary = true;

      binds[bind] = io = socketIo({
        path: `${this.web.prefix}${endpoint}`,
        pingInterval: this.pingInterval || this.constructor.defaultPingInterval,
        pingTimeout: this.pingTimeout || this.constructor.defaultPingTimeout,
        transports: ['websocket']
      });

      if (this.mq) {
        await this.mq.ready;
        io.adapter(amqpAdapter(this.mq));
      }

      this.attachToServers(io);
    }

    Object.assign(this, {
      io,
      subscriptions: {}
    });

    this.addSubscriptions();
    io.on('connection', this.onConnection.bind(this));
  }

  async finish() {
    this.removeSubscriptions();
    if (this.primary) await util.promisify(this.io.close).call(this.io);
    delete this.io;
    delete this.subscriptions;
    await super.finish();
  }

  async join(rooms) {
    await util.promisify(this.socket.join).call(this.socket, rooms);
  }

  async leave(room) {
    await util.promisify(this.socket.leave).call(this.socket, room);
  }
}

Socket.defaultPingInterval = 25000;
Socket.defaultPingTimeout = 60000;

Socket.rxSocketSub = /^(\w+)\s+(\S+)(\s+(\/\S+))?((\s*>\s*[^\s>]+)*)$/;

module.exports = Socket;
