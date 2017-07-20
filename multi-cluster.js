const getWorkerId = (nServices) => {
  const clusterSize = process.env.NODE_CLUSTER_SIZE || 1;

  process.env.NODE_CLUSTER_SIZE = clusterSize * nServices;

  const Cluster = require('./cluster');

  if (Cluster.isMaster) return 0;

  const workerIdZ = process.env.NODE_CLUSTER_ID - 1;
  process.env.NODE_CLUSTER_SIZE = clusterSize;
  process.env.NODE_CLUSTER_ID = (workerIdZ / nServices | 0) + 1;

  const serviceId = (workerIdZ % nServices) + 1;
  return serviceId;
};

module.exports = getWorkerId;
