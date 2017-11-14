const Rest = require('./rest');
const body = require('body-parser');
const Multer = require('multer');

const multer = Multer({dest: '/tmp'});

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

  async text(req) {
    const result = await this.express(multer.array(), req);
    return result;
  }
}

Object.assign(Upload, {Multer, multer, body});

module.exports = Upload;
