const AutoInit = require('./auto-init');
const basicAuth = require('basic-auth');
const express = require('express');
const http = require('http');
const https = require('https');
const util = require('util');

class Web extends AutoInit {
  // httpBind : a HTTP port or host:port to listen
  // httpOpts : HTTP connection options
  // httpsBind : a HTTPS port or host:port to listen
  // httpsOpts : HTTPS connection options
  // prefix : prefix paths with given string

  createServers() {
    const bind = `WEB ${this.bind}`;
    const exists = Web.binds[bind];

    if (exists) {
      Object.assign(this, exists);
      this.primary = false;
    } else {
      this.app = express();
      if (this.httpBind) this.http = http.Server(this.app, this.httpOpts);

      if (this.httpsBind) {
        if (this.httpBind === this.httpsBind) {
          this.https = this.http;
          this.https.setSecure(this.httpsOpts);
        } else {
          this.https = https.Server(this.app, this.httpsOpts);
        }
      }

      Web.binds[bind] = {app: this.app, http: this.http, https: this.https};
      this.primary = true;
    }
  }

  use(middleware) {
    if (!this.prefix) return this.app.use(middleware);
    return this.app.use(this.prefix, middleware);
  }

  async init() {
    await super.init();

    ['basicAuth', 'express', 'serveStatic'].forEach((key) => {
      this[key] = this.constructor[key];
    });

    if (!this.prefix) this.prefix = '';
    this.bind = this.httpBind || this.httpsBind;
    this.createServers();

    if (this.primary) {
      if (this.http) await util.promisify(this.http.listen).call(this.http, this.httpBind);

      if (this.https && this.https !== this.http) {
        await util.promisify(this.https.listen).call(this.https, this.httpsBind);
      }
    }
  }

  async response(data, req) {
    req.res.end(data);
  }

  async error(err, req) {
    req.res.status(500);
    req.res.end(err);
  }

  async finish() {
    if (this.primary) {
      if (this.http) this.http.close();
      if (this.https && this.https !== this.http) this.https.close();
    }

    delete this.app;
    delete this.http;
    delete this.https;
    await super.finish();
  }
}

Object.assign(Web, {express, serveStatic: express.static, basicAuth});
Web.binds = {};

module.exports = Web;
