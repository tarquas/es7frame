const cluster = require('cluster');
const os = require('os');

const clusterSize = process.env.NODE_CLUSTER_SIZE;
const restartDelay = process.env.NODE_CLUSTER_RESTART_DELAY;

if (clusterSize && cluster.isMaster) {
  class Cluster {
    static spawnWorker(id) {
      return cluster.fork({NODE_CLUSTER_ID: id, NODE_CLUSTER_SIZE: Cluster.numWorkers});
    }

    static async workerExit(worker, code, signal) {
      const originalId = Cluster.workerMap[worker.id];
      delete Cluster.workerMap[worker.id];
      if (!code || Cluster.termSignals[signal]) return;
      if (restartDelay) await (new Promise(resolve => setTimeout(resolve, restartDelay)));
      const restarted = Cluster.spawnWorker(originalId);
      Cluster.workerMap[restarted.id] = originalId;
    }

    static async master() {
      cluster.on('exit', Cluster.workerExit);

      for (let i = 1; i <= Cluster.numWorkers; i++) {
        const worker = Cluster.spawnWorker(i);
        Cluster.workerMap[worker.id] = i;
      }
    }

    static async abort(exitCode) {
      cluster.on('exit', async (worker) => {
        delete Cluster.workerMap[worker.id];

        for (const any in Cluster.workerMap) {
          if (Object.hasOwnProperty.call(Cluster.workerMap, any)) return;
        }

        process.exit(exitCode);
      });
    }
  }

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

  process.on('SIGTERM', () => Cluster.abort('SIGTERM'));
  process.on('SIGHUP', () => Cluster.abort('SIGHUP'));
  process.on('SIGINT', () => Cluster.abort('SIGINT'));

  setImmediate(Cluster.master);
  module.exports = false;
} else {
  const Async = require('./async');

  class Cluster extends Async {
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

  module.exports = Cluster;
}
