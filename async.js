const EventEmitter = require('events');

class Async extends EventEmitter {
  constructor() {
    super();
    this.ready = this.init();
    this.ready.catch(() => true);
    this.finishTimeout = this.constructor.finishTimeoutMsec;
    this.instanceId = Async.nextInstanceId++;
    this[Async.isAsync] = true;
    Async.instances[this.instanceId] = this;
  }

  async init() {
    if (this.ready) throw new Error(`Async: explicit call of 'init()' on ${Object.getPrototypeOf(this).constructor.name} is not allowed`);
    await new Promise(resolve => setImmediate(resolve));
  }

  async finish() {
    delete Async.instances[this.instanceId];
    this.finish = Async.nullAsyncFunc;
    this.finished = true;
  }

  async main() {
    // virtual
  }

  async throw(err) {
    throw err;
  }

  static abort(code) {
    return code;
  }

  static abortError(err) {
    return err;
  }

  static async finishAllInstances() {
    for (const instanceId in Async.instances) {
      if (Object.hasOwnProperty.call(Async.instances, instanceId)) {
        const instance = Async.instances[instanceId];
        const timeout = Async.delay(instance.finishTimeout);
        const finish = instance.finish().catch(() => true);
        await Promise.race([timeout, finish]); // eslint-disable-line
      }
    }
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

    const mainProc = this.main(...process.argv);

    if (this.stay) {
      mainProc.catch(this.constructor.abortError);
      code = await abort;
    } else {
      code = await Promise.race([abort, mainProc]);
    }

    if (this.ignore) return false;
    return code;
  }

  async runMain() {
    if (this.ignore) return false;
    if (!this.ready) return false;
    let code;

    try {
      await this.ready;
      code = await this.runMainInited();
    } catch (err) {
      await this.throw(err);
    }

    return code;
  }

  static throw(err) {
    const error = err || 'unknown';

    if (!this.errorSilent) {
      const now = new Date().toISOString();
      console.log(`>>> ${now} @ CRITICAL\n\n${error.stack || error}`);
    }

    const code = isFinite(error.code) ? error.code : 1;
    return code;
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

  static delay(msec) {
    const timeout = new Promise(resolve => setTimeout(resolve, msec));
    return timeout;
  }

  static tick() {
    const tick = new Promise(resolve => setImmediate(resolve));
    return tick;
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

let hold = false;
let code = 0;

function holdOn(init) {
  if (init || hold) {
    hold = setTimeout(holdOn, Async.holdOnTimeoutMsec);
  }
}

function getLauncherFromMain() {
  const main = require.main;
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
      const session = new Launcher();
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
