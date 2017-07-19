const AutoInit = require('./auto-init');
const Async = require('./async');
const rabbit = require('rabbit.js');
const uuid = require('uuid');

class Mq extends AutoInit {
  // connString : RabbitMQ AMQP Connection String
  // connOpts [optional] : AMQP connection options
  // prefix [optional] : prefix to queues

  constructor(setup) {
    super(setup);
    if (!this.connString) throw new Error('AMQP Connection string is not specified');
    if (!this.prefix) this.prefix = '';
    if (!this.connOpts) this.connOpts = {};
  }

  async init() {
    await super.init();
    this.context = rabbit.createContext(this.connString);
    await Async.waitEvent(this.context, 'ready', 'error');
    this.conn = await this.context._connection;
  }

  async error(err, {id, type}) {
    const now = new Date().toISOString();

    if (!this.errorSilent) {
      console.log(`>>> ${now} @ ${type.toUpperCase()} ${id}\n\n${err.stack || err}`);
    }
  }

  static objToBuffer(obj) {
    const data = new Buffer(JSON.stringify(obj), 'utf8');
    return data;
  }

  static bufferToObj(buffer) {
    const decoded = JSON.parse(buffer.toString('utf8'));
    return decoded;
  }

  async getQueueStatus(id) {
    const ch = await this.conn.createChannel();
    const queue = `${this.prefix}${id}`;

    try {
      const info = await ch.assertQueue(queue, {durable: true});
      return info;
    } finally {
      ch.close();
    }
  }

  async handler(id, onData, type, queueOpts, process) {
    const ch = await this.conn.createChannel();
    const queue = `${this.prefix}${id}`;

    await ch.assertQueue(queue, queueOpts);
    ch.prefetch(1);

    await ch.consume(queue, async (msg) => {
      if (!msg) return;

      if (process) {
        await process.call(this, id, onData, {ch, type, queueOpts, msg});
      } else {
        const decoded = this.constructor.bufferToObj(msg.content);

        try {
          await onData(decoded);
        } catch (err) {
          if (!(await this.error(err, {id, msg, type}))) throw err;
        }
      }

      ch.ack(msg);
    }, {noAck: false});

    const handlerId = Mq.nextHandlerId++;
    Mq.handlers[handlerId] = ch;
    return handlerId;
  }

  async push(id, payload) {
    const ch = await this.conn.createChannel();
    const queue = `${this.prefix}${id}`;

    try {
      await ch.assertQueue(queue, {durable: true});
      const data = this.constructor.objToBuffer(payload);
      const sent = await ch.sendToQueue(queue, data, {persistent: true});
      return sent;
    } finally {
      ch.close();
    }
  }

  async worker(id, onData) {
    const handlerId = await this.handler(id, onData, 'worker', {durable: true});
    return handlerId;
  }

  async rpc(id, payload) {
    const ch = await this.conn.createChannel();
    const queue = `${this.prefix}${id}`;

    try {
      const corrId = uuid();
      const qok = await ch.assertQueue('', {exclusive: true});

      const promise = new Promise(async (resolve, reject) => {
        await ch.consume(qok.queue, (msg) => {
          if (msg.properties.correlationId === corrId) {
            const decoded = this.constructor.bufferToObj(msg.content);

            if (decoded.error) {
              if (decoded.error.isError) {
                const toThrow = new Error(decoded.error.message);
                if (decoded.error.stack) toThrow.stack = decoded.error.stack;
                reject(toThrow);
              } else reject(decoded.error);
            } else resolve(decoded.data);
          }
        });
      });

      const data = this.constructor.objToBuffer(payload);
      await ch.sendToQueue(queue, data, {correlationId: corrId, replyTo: qok.queue});

      const result = await promise;
      return result;
    } catch (err) {
      if (!(await this.error(err, {id, msg: payload, type: 'rpc'}))) throw err;
    } finally {
      ch.close();
    }

    return null;
  }

  static rpcMakeError(err) {
    if (err instanceof Error) {
      const encErr = {isError: true, message: err.message, stack: err.stack};
      return {error: encErr};
    }

    return {error: err};
  }

  async rpcWorkerProcess(id, onData, {ch, type, msg}) {
    const decoded = this.constructor.bufferToObj(msg.content);
    let response;

    try {
      response = {data: await onData(decoded)};
    } catch (err) {
      response = this.constructor.rpcMakeError(err);
    }

    const data = this.constructor.objToBuffer(response);

    try {
      await ch.sendToQueue(
        msg.properties.replyTo,
        data,
        {correlationId: msg.properties.correlationId}
      );
    } catch (err) {
      if (await this.error(err, {id, msg, type})) throw err;
    }
  }

  async rpcworker(id, onData) {
    const handlerId = await this.handler(id, onData, 'rpcworker', {durable: false}, this.rpcWorkerProcess);
    return handlerId;
  }

  async pub(id, payload) {
    const queue = `${this.prefix}${id}`;
    const pub = this.context.socket('PUBLISH');

    try {
      await new Promise(resolve => pub.connect(queue, resolve));
      pub.write(JSON.stringify(payload, null, 2), 'utf8');
    } finally {
      pub.ch.close();
    }
  }

  async sub(id, onData) {
    const queue = `${this.prefix}${id}`;
    const sub = this.context.socket('SUBSCRIBE');
    await new Promise(resolve => sub.connect(queue, resolve));
    sub.setEncoding('utf8');

    sub.on('data', async (data) => {
      try {
        const obj = JSON.parse(data);
        await onData(obj);
      } catch (err) {
        await this.error(err, {id, msg: data, type: 'sub'});
      }
    });

    const handlerId = Mq.nextHandlerId++;
    Mq.handlers[handlerId] = sub.ch;
    return handlerId;
  }

  async unhandle(handlerId) {
    const ch = Mq.handlers[handlerId];
    if (!ch) return;
    ch.close();
    delete Mq.handlers[handlerId];
  }

  async finish() {
    this.conn.close();
    await super.finish();
  }
}

Mq.handlers = {};
Mq.nextHandlerId = 0;

module.exports = Mq;
