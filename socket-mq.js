const Adapter = require('socket.io-adapter');

const msgpack = {
  encode: (data) => {
    const json = JSON.stringify(data, null, 2);
    const buffer = new Buffer(json, 'utf8');
    return buffer;
  },

  decode: (msg) => {
    const json = msg.toString('utf8');
    const data = JSON.parse(json);
    return data;
  }
};

const adapterMaker = (mq, options) => {
  const opts = Object.assign({}, {
    queueName: '',
    channelSeperator: '#',
    prefix: mq.prefix || '',
    useInputExchange: false
  }, options);

  const prefix = opts.prefix;

  const getChannelName = (...args) => (args.join(opts.channelSeperator) + opts.channelSeperator);

  class AMQPAdapter extends Adapter {
    constructor(nsp) {
      super(nsp);
      this.super = Object.getPrototypeOf(Object.getPrototypeOf(this));

      this.amqpExchangeOptions = {
        durable: true,
        internal: false,
        autoDelete: false
      };

      this.amqpExchangeName = `${opts.prefix}-socket.io`;
      this.amqpInputExchangeName = `${opts.prefix}-socket.io-input`;

      this.publishExchange = (
        opts.useInputExchange ?
          this.amqpInputExchangeName :
          this.amqpExchangeName
      );

      this.connected = this.initMq();
    }

    async initMq() {
      const ch = await mq.conn.createChannel();
      await ch.assertExchange(this.amqpExchangeName, 'direct', this.amqpExchangeOptions);

      if (opts.useInputExchange) {
        await ch.assertExchange(
          this.amqpInputExchangeName,
          'fanout',
          this.amqpExchangeOptions
        );
      }

      const incomingMessagesQueue = {
        exclusive: true,
        durable: false,
        autoDelete: true
      };

      const queue = await ch.assertQueue(opts.queueName, incomingMessagesQueue);
      this.amqpIncomingQueue = queue.queue;
      this.globalRoomName = getChannelName(prefix, this.nsp.name);
      await ch.bindQueue(this.amqpIncomingQueue, this.amqpExchangeName, this.globalRoomName);

      const ok = await ch.consume(
        this.amqpIncomingQueue,
        msg => this.onmessage(msg.content),
        { noAck: true }
      );

      this.amqpConsumerID = ok.consumerTag;
      this.ch = ch;
      return ch;
    }


    onmessage(msg) {
      const args = msgpack.decode(msg);
      if (this.amqpConsumerID === args.shift()) return;
      const packet = args[0];
      if (packet && !packet.nsp) packet.nsp = '/';
      if (!packet || packet.nsp !== this.nsp.name) return;
      args.push(true);
      this.super.broadcast.apply(this, args);
    }

    add(id, room, fn) {
      return this.addAll(id, [room], fn);
    }

    async addAll(id, rooms, fn) {
      try {
        const ch = await this.connected;

        await Promise.all(rooms.map(async (room) => {
          const needToSubscribe = !this.rooms[room];
          this.super.add.call(this, id, room);
          const channel = getChannelName(prefix, this.nsp.name, room);
          if (!needToSubscribe) return;
          await ch.bindQueue(this.amqpIncomingQueue, this.amqpExchangeName, channel, {});
        }));

        if (fn) fn();
      } catch (err) {
        this.emit('error', err);
        if (fn) fn(err);
      }
    }

    async broadcast(packet, bOpts) {
      this.super.broadcast.call(this, packet, bOpts);
      const ch = await this.connected;

      if (bOpts.rooms && bOpts.rooms.length) {
        const all = await Promise.all(bOpts.rooms.map(async (room) => {
          const chn = getChannelName(prefix, packet.nsp, room);
          const msg = msgpack.encode([this.amqpConsumerID, packet, bOpts]);
          const published = await ch.publish(this.publishExchange, chn, msg);
          return published;
        }));

        return all;
      }

      const msg = msgpack.encode([this.amqpConsumerID, packet, bOpts]);
      const published = await ch.publish(this.publishExchange, this.globalRoomName, msg);
      return published;
    }

    async del(id, room, fn) {
      try {
        const ch = await this.connected;
        this.super.del.call(this, id, room);

        if (!this.rooms[room]) {
          const channel = getChannelName(prefix, this.nsp.name, room);
          await ch.unbindQueue(this.amqpIncomingQueue, this.amqpExchangeName, channel);
        }

        if (fn) fn();
      } catch (err) {
        this.emit('error', err);
        if (fn) fn(err);
      }
    }

    async delAll(id, fn) {
      try {
        const ch = await this.connected;
        const rooms = this.sids[id] || {};
        this.super.delAll.call(this, id);

        await Promise.all(Object.keys(rooms).map(async (roomId) => {
          if (!this.rooms[roomId]) {
            const channel = getChannelName(prefix, this.nsp.name, roomId);
            await ch.unbindQueue(this.amqpIncomingQueue, this.amqpExchangeName, channel);
          }
        }));

        delete this.sids[id];
        if (fn) fn();
      } catch (err) {
        this.emit('error', err);
        if (fn) fn(err);
      }
    }
  }

  return AMQPAdapter;
};

module.exports = adapterMaker;
