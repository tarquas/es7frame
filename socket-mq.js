const Adapter = require('socket.io-adapter');
const Db = require('./db');

const adapterMaker = (mq, options) => {
  const opts = Object.assign({}, {
    queueName: '',
    channelSeperator: '#',
    prefix: mq.prefix || ''
  }, options);

  const myId = Db.newShortId();
  const {prefix} = opts;

  const getChannelName = (...args) => (args.join(opts.channelSeperator) + opts.channelSeperator);

  class MqAdapter extends Adapter {
    constructor(nsp) {
      super(nsp);
      this.super = Object.getPrototypeOf(Object.getPrototypeOf(this));
      this.encoder = this.nsp.adapter.encoder;
      this.event = `${prefix}-socket.io`;
      this.subs = {};
      this.mq = mq;
      this.onmessageBound = this.onmessage.bind(this);
      this.connected = this.initMq();
    }

    async initMq() {
      this.globalRoomName = getChannelName(this.event, this.nsp.name);
      this.globalSubId = await this.mq.sub(this.globalRoomName, this.onmessageBound);
    }


    onmessage(msg) {
      if (this.myId === msg.id || !msg.id) return;
      const args = msg.data;
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
        await this.connected;

        await Promise.all(rooms.map(async (room) => {
          const needToSubscribe = !this.rooms[room];

          if (this.super.addAll) {
            this.super.addAll.call(this, [id], room);
          } else {
            this.super.add.call(this, id, room);
          }

          const event = getChannelName(this.event, this.nsp.name, room);
          if (!needToSubscribe) return;
          this.subs[event] = await this.mq.sub(event, this.onmessageBound);
        }));

        if (fn) fn();
      } catch (err) {
        this.emit('error', err);
        if (fn) fn(err);
      }
    }

    async broadcast(packet, bOpts, remote) {
      this.super.broadcast.call(this, packet, bOpts);
      await this.connected;

      if (!remote) {
        const data = [packet, bOpts];

        if (bOpts.rooms && bOpts.rooms.length) {
          const all = await Promise.all(bOpts.rooms.map(async (room) => {
            const event = getChannelName(this.event, packet.nsp, room);
            await this.mq.pub(event, {id: myId, data});
          }));

          return all;
        }

        const result = await this.mq.pub(this.globalRoomName, {id: myId, data: [packet, opts]});
        return result;
      }

      return null;
    }

    async del(id, room, fn) {
      try {
        await this.connected;
        this.super.del.call(this, id, room);

        if (this.rooms[room]) {
          const event = getChannelName(this.event, this.nsp.name, room);
          await this.mq.unhandle(this.subs[event]);
        }

        if (fn) fn();
      } catch (err) {
        this.emit('error', err);
        if (fn) fn(err);
      }
    }

    async delAll(id, fn) {
      try {
        await this.connected;
        const rooms = this.sids[id] || {};
        this.super.delAll.call(this, id);

        await Promise.all(Object.keys(rooms).map(async (roomId) => {
          if (this.rooms[roomId]) {
            const event = getChannelName(this.event, this.nsp.name, roomId);
            await this.mq.unhandle(this.subs[event]);
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

  return MqAdapter;
};

module.exports = adapterMaker;
