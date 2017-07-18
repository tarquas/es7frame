const Web = require('./web');
const cors = require('cors');
const compression = require('compression');

const defaultErrors = {
  badRequest: '400 Bad Request',
  badAuth: '401 Unauthorized',
  needPay: '402 Payment Required',
  denied: '403 Forbidden',
  notFound: '404 Not Found',
  conflict: '409 Conflict',
  internal: '500 Internal Server Error'
};

class WebApi extends Web {
  async init() {
    await super.init();

    this.use(cors({
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Type', 'Date']
    }));

    this.use(compression({level: 9}));
  }

  static get errors() {
    if (Object.hasOwnProperty.call(this, '_errors')) return this._errors;
    this._errors = Object.create(super.errors || defaultErrors);
    return this._errors;
  }

  get errors() {
    const errors = this.constructor.errors;
    return errors;
  }

  async response(data, req) {
    req.res.end(JSON.stringify(data, null, 2));
  }

  async internalError(err, req) {
    const now = new Date().toISOString();
    req.res.status(500);

    if (!this.errorSilent) {
      console.log(`>>> ${now} @ ${req.method} ${req.path}\n\n${err.stack || err}`);
    }

    this.response({
      error: 'internal',
      code: err.code,
      message: err.message,
      at: now
    }, req);
  }

  async customError(err, req) {
    req.res.status(500);

    this.response({
      error: 'custom',
      content: err
    }, req);
  }

  async restError(err, req) {
    const error = this.errors[err];
    if (!error) return this.customError(err, req);

    const [ents, code, message] = error.match(WebApi.rxErrorDesc) || [];
    if (!ents) return this.customError(err, req);

    const status = code - 0;
    req.res.status(status);

    this.response({
      error: err,
      code: status,
      message
    }, req);

    return true;
  }

  async error(err, req) {
    if (err instanceof Error) return this.internalError(err, req);
    if (err.constructor === String) return this.restError(err, req);
    return this.customError(err, req);
  }
}

WebApi.rxErrorDesc = /^(\d+)\s+(.*)$/;

module.exports = WebApi;
