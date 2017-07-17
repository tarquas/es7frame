const Rest = require('./rest');
const body = require('body-parser');

class Upload extends Rest {
  async json1k(req) {
    const result = await this.express(body.json({limit: 1024}), req);
    return result;
  }

  async json10k(req) {
    const result = await this.express(body.json({limit: 10240}), req);
    return result;
  }

  async json100k(req) {
    const result = await this.express(body.json({limit: 102400}), req);
    return result;
  }

  async json1M(req) {
    const result = await this.express(body.json({limit: 1048576}), req);
    return result;
  }

  async json10M(req) {
    const result = await this.express(body.json({limit: 10485760}), req);
    return result;
  }
}

module.exports = Upload;
