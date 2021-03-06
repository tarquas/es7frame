const EventEmitter = require('events');

class Async extends EventEmitter {
  constructor() {
    super();
    this.static = this.constructor;
    this.dependents = {};
    this.depFinishing = {};

    this.waitFinish = new Promise((resolve) => {
      this.signalFinish = resolve;
    });

    this.ready = this.init();
    this.finishTimeout = this.constructor.finishTimeoutMsec;
    this.instanceId = Async.nextInstanceId++;
    this[Async.isAsync] = true;
    Async.instances[this.instanceId] = this;

    this.anywayReady = this.ready.catch(() => {
      this.initFailed = true;
    });
  }

  static get type() { return 'main'; }

  async init() {
    if (!this.delayedInit) {
      if (this.ready) throw new Error(`Async: explicit call of 'init()' on ${Object.getPrototypeOf(this).constructor.name} is not allowed`);
    } else {
      await this.delayedInit;
      this.delayedInit = null;
    }

    await new Promise(resolve => setImmediate(resolve));
  }

  async finish() {
    delete Async.instances[this.instanceId];
    this.finish = Async.nullAsyncFunc;
    this.finished = true;
    this.signalFinish();
  }

  async main() {
    // virtual
  }

  static abort(code) {
    return code;
  }

  static abortError(err) {
    return err;
  }

  static raceDone(promise, error) {
    return (data) => {
      const map = this.raceMap.get(promise);
      if (!map) return;
      this.raceMap.delete(promise);
      promise[this.promiseIsError] = error;
      promise[this.promiseValue] = data;

      for (const trigger of map.keys()) {
        for (const submap of trigger.map.keys()) {
          submap.delete(trigger);
        }

        trigger.map.clear();
        delete trigger.map;
        const action = error ? trigger.reject : trigger.resolve;
        delete trigger.resolve;
        delete trigger.reject;
        action(data);
      }

      map.clear();
    };
  }

  race(...args) {
    return this.constructor.race(...args);
  }

  static race(promises) {
    for (const promise of promises) {
      if (!(promise instanceof Promise)) return Promise.resolve(promise);

      if (this.promiseIsError in promise) {
        const data = promise[this.promiseValue];
        if (promise[this.promiseIsError]) return Promise.reject(data);
        return Promise.resolve(data);
      }
    }

    return this.racePending(promises);
  }

  static racePending(promises) {
    let trigger;

    const result = new Promise((resolve, reject) => {
      trigger = {resolve, reject};
    });

    const tMap = new Map();
    trigger.map = tMap;

    for (const promise of promises) {
      let map = this.raceMap.get(promise);

      if (!map) {
        map = new Map();
        this.raceMap.set(promise, map);
        promise.then(this.raceDone(promise, false), this.raceDone(promise, true));
      }

      map.set(trigger, true);
      tMap.set(map, true);
    }

    return result;
  }

  static async finishAllInstances() {
    await Promise.all(Reflect.ownKeys(Async.instances).map(async (instanceId) => {
      const instance = Async.instances[instanceId];
      instance.shutdown = true;
      await instance.anywayReady;

      await Promise.all(Reflect.ownKeys(instance.dependents).map(async (depdId) => {
        const depd = Async.instances[depdId];
        if (!depd) return;
        instance.depFinishing[depdId] = true;
        if (depd.depFinishing[instanceId]) return;
        await depd.waitFinish;
      }));

      const timeout = Async.delay(instance.finishTimeout);
      const finish = instance.finish().catch(err => this.throw(err, 'IN FINALIZER'));
      await this.race([timeout, finish]); // eslint-disable-line
    }));
  }

  async runMainInited() {
    if (this.ignore) return false;
    let code;

    const abort = new Promise((resolve, reject) => {
      this.constructor.abort = resolve;
      this.constructor.abortError = reject;
    });

    process.on('SIGTERM', () => this.constructor.abort('SIGTERM'));
    process.on('SIGHUP', () => this.constructor.abort('SIGHUP'));
    process.on('SIGINT', () => this.constructor.abort('SIGINT'));

    process.on('unhandledException', err => this.constructor.throw(err, 'UNHANDLED EXCEPTION'));
    process.on('unhandledRejection', err => this.constructor.throw(err, 'UNHANDLED PROMISE REJECTION'));

    const mainProc = this.main(...process.argv);

    if (this.stay) {
      mainProc.catch(this.constructor.abortError);
      code = await abort;
    } else {
      code = await this.constructor.race([abort, mainProc]);
    }

    if (this.ignore) return false;
    return code;
  }

  static async runMain(Launcher) {
    const session = Launcher.defaultInstance || new Launcher();
    return session.runMain();
  }

  async runMain() {
    if (!this.main) return false;
    if (typeof this.main === 'object') return this.main.runMain();
    if (this.ignore) return false;
    if (!this.ready) return false;
    let code;

    try {
      await this.ready;
      code = await this.runMainInited();
    } catch (err) {
      code = await this.throw(err);
    }

    return code;
  }

  static throw(err, type) {
    const error = err || 'unknown';

    if (!this.errorSilent) {
      const now = new Date().toISOString();
      console.log(`>>> ${now} @ ${type || 'CRITICAL'}\n\n${error.stack || error}`);
    }

    const code = isFinite(error.code) ? error.code : 1;
    return code;
  }

  throw(...args) {
    return this.constructor.throw(...args);
  }

  static waitEvent(context, subs, throws) {
    const unsubs = [];

    const subone = (sub, func) => {
      const wfunc = (data, ...args) => func({event: sub, data, args});
      unsubs.push({sub, func: wfunc});

      (
        context.on ||
        context.addListener ||
        context.addEventListener
      ).call(context, sub, wfunc);
    };

    const unsuball = () => unsubs.forEach(v => (
      context.off ||
      context.removeListener ||
      context.removeEventListener
    ).call(context, v.sub, v.func));

    const promise = new Promise((resolve, reject) => {
      if (subs) {
        subs.split(',').forEach(ev => subone(ev, (e2) => {
          unsuball();
          resolve(e2);
        }));
      }

      if (throws) {
        throws.split(',').forEach(ev => subone(ev, (e2) => {
          unsuball();
          reject(e2);
        }));
      }
    });

    return promise;
  }

  waitEvent(...args) {
    return this.constructor.waitEvent(...args);
  }

  static delay(msec) {
    const timeout = new Promise(resolve => setTimeout(resolve, msec));
    return timeout;
  }

  delay(...args) {
    return this.constructor.delay(...args);
  }

  static async timeout(msec, err) {
    await this.delay(msec);
    throw err || 'timeout';
  }

  timeout(...args) {
    return this.constructor.timeout(...args);
  }

  static tick() {
    const tick = new Promise(resolve => setImmediate(resolve));
    return tick;
  }

  tick(...args) {
    return this.constructor.tick(...args);
  }

  static async nullAsyncFunc() {
  }
}

module.exports = Async;

Async.isAsync = Symbol('isAsync');
Async[Async.isAsync] = true;

Async.instances = {};
Async.nextInstanceId = 0;
Async.holdOnTimeoutMsec = 60000;

Async.finishTimeoutMsec = 2000;

Async.raceMap = new Map();
Async.promiseValue = Symbol('promiseValue');
Async.promiseIsError = Symbol('promiseIsError');

let hold = false;
let code = 0;

function holdOn(init) {
  if (init || hold) {
    hold = setTimeout(holdOn, Async.holdOnTimeoutMsec);
  }
}

function getLauncherFromMain() {
  const {main} = require;
  if (!main) return null;

  const Launcher = main.exports;
  if (!Launcher || Launcher.ignore || !Launcher[Async.isAsync]) return null;

  return Launcher;
}

function getLauncher() {
  if (Async.Launcher) return Async.Launcher;
  if (global.Launcher) return global.Launcher;
  return getLauncherFromMain();
}

async function master() {
  const Launcher = getLauncher();
  if (!Launcher) return;

  try {
    holdOn(true);

    try {
      const session = Launcher.defaultInstance || new Launcher();
      code = await session.runMain();
      if (code === false) return;
    } finally {
      await Launcher.finishAllInstances();
      clearTimeout(hold);
      hold = false;
    }
  } catch (err) {
    code = Launcher.throw(err);
  }

  process.exit(code);
}

setImmediate(master);
