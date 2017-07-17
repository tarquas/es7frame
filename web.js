const AutoInit = require('./auto-init');
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

  constructor(setup) {
    super(setup);
    if (!this.prefix) this.prefix = '';
    this.bind = this.httpBind || this.httpsBind;
    this.createServers();
  }

  createServers() {
    if (this.primary != null) return;
    const exists = Web.binds[this.bind];

    if (exists) {
      Object.assign(this, exists);
      this.primary = false;
    } else {
      this.app = express();
      if (this.httpBind) this.http = http.Server(this.app, this.httpOpts);
      if (this.httpsBind) this.https = https.Server(this.app, this.httpsOpts);
      Web.binds[this.bind] = {app: this.app, http: this.http, https: this.https};
      this.primary = true;
    }
  }

  async init() {
    await super.init();

    if (this.primary) {
      if (this.http) await util.promisify(this.http.listen).call(this.http, this.httpBind);
      if (this.https) await util.promisify(this.https.listen).call(this.https, this.httpsBind);
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
    this.server.close();
    await super.finish();
  }
}

Web.binds = {};

module.exports = Web;
