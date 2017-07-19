const cluster = require('cluster');
const os = require('os');

const clusterSize = process.env.NODE_CLUSTER_SIZE;
const restartDelay = process.env.NODE_CLUSTER_RESTART_DELAY;

const isCluster = Symbol('isCluster');
const isWorker = Symbol('isWorker');

if (clusterSize && cluster.isMaster) {
  class Cluster {
    constructor() {
      this[isCluster] = true;
    }

    static spawnWorker(id) {
      return cluster.fork({NODE_CLUSTER_ID: id, NODE_CLUSTER_SIZE: this.numWorkers});
    }

    static async workerExit(worker, code, signal) {
      const originalId = this.workerMap[worker.id];
      delete this.workerMap[worker.id];
      if (!code || this.termSignals[signal]) return;
      if (restartDelay) await (new Promise(resolve => setTimeout(resolve, restartDelay)));
      const restarted = this.spawnWorker(originalId);
      this.workerMap[restarted.id] = originalId;
    }

    static async master() {
      cluster.on('exit', this.workerExit.bind(this));

      process.on('SIGTERM', () => this.abort('SIGTERM'));
      process.on('SIGHUP', () => this.abort('SIGHUP'));
      process.on('SIGINT', () => this.abort('SIGINT'));

      for (let i = 1; i <= this.numWorkers; i++) {
        const worker = this.spawnWorker(i);
        this.workerMap[worker.id] = i;
      }
    }

    static async onWorkerExit(worker, exitCode) {
      delete this.workerMap[worker.id];

      for (const any in this.workerMap) {
        if (Object.hasOwnProperty.call(this.workerMap, any)) return;
      }

      process.exit(exitCode);
    }

    static async abort(exitCode) {
      cluster.on('exit', worker => this.onWorkerExit(worker, exitCode));
    }
  }

  Cluster.isMaster = true;
  Cluster.ignore = true;
  Cluster.numWorkers = clusterSize === 'cpus' ? os.cpus().length : Math.abs(clusterSize | 0) || 1;
  Cluster.restartDelay = restartDelay || 2000;
  Cluster.workerMap = {};

  Cluster.termSignals = {
    SIGTERM: true,
    SIGINT: true,
    SIGHUP: true,
    SIGKILL: true
  };

  const getLauncherFromMain = () => {
    if (!require.main) return null;
    const Launcher = require.main.exports;
    if (!Launcher || Launcher.ignore || !Launcher[Cluster.isCluster]) return null;
    return Launcher;
  };

  const getLauncher = () => {
    if (Cluster.Launcher) return Cluster.Launcher;
    return getLauncherFromMain();
  };

  const master = async () => {
    const Launcher = getLauncher();

    if (Launcher && Launcher.master) {
      await Launcher.master();
    } else {
      await Cluster.master();
    }
  };

  Object.assign(Cluster, {isCluster, isWorker});
  Cluster[isCluster] = true;
  module.exports = Cluster;

  setImmediate(master);
} else {
  const Async = require('./async');

  class Cluster extends Async {
    constructor() {
      super();
      this[isWorker] = true;
    }

    async init() {
      await super.init();
      this.workerId = process.env.NODE_CLUSTER_ID;
      this.numWorkers = process.env.NODE_CLUSTER_SIZE;
    }
  }

  if (!clusterSize) {
    process.env.NODE_CLUSTER_ID = 1;
    process.env.NODE_CLUSTER_SIZE = 1;
  }

  Object.assign(Cluster, {isCluster, isWorker});
  Cluster[isWorker] = true;
  module.exports = Cluster;
}
