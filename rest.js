const AutoInit = require('./auto-init');

class Rest extends AutoInit {
  // web -- webserver (class Web) instance

  static get type() { return 'rest'; }

  async express(middleware, req) {
    const result = await new Promise((resolve, reject) => {
      try {
        middleware.call(
          this,
          req,
          req.res,
          data => (data instanceof Error ? reject(data) : resolve(data))
        );
      } catch (err) {
        reject(err);
      }
    });

    return result;
  }

  async callHandler(handler, req, context) {
    let result;
    const ctx = context || this;

    if (Object.getPrototypeOf(handler).constructor.name === 'AsyncFunction') {
      result = await handler.call(ctx, req, req);
    } else {
      result = await this.express.call(ctx, handler, req);
    }

    return result;
  }

  async processMiddlewares(names, req) { // eslint-disable-line
    for (const name of names) {
      const fields = name.split('.');
      let p = this.web;
      let context = null;

      for (const field of fields) {
        p = p ? p[field] : this;
        if (!context) context = p;
        if (!p) throw new Error(`Property ${field} not found in ${name} middleware`);
      }

      await this.callHandler(p, req, context); // eslint-disable-line
    }
  }

  wrapToMiddleware(handler, middleware) {
    return async (req, res, next) => {
      try {
        if (middleware) {
          const names = middleware.match(this.constructor.rxMiddleware);
          if (!names) return;
          await this.processMiddlewares(names, req);
        }

        const data = await this.callHandler(handler, req);

        if (data) {
          await this.web.response(data, req);
        } else {
          next();
        }
      } catch (err) {
        await this.web.error(err, req);
      }
    };
  }

  addRoute(action, customHandler) {
    const [matched, method, path, middleware] = action.match(this.constructor.rxMethodPath) || [];
    if (!matched) return;
    const handler = customHandler || this[action];
    const func = this.web.app[method.toLowerCase()];

    if (func) {
      func.call(
        this.web.app,
        `${this.web.prefix}${path}`,
        this.wrapToMiddleware(handler, middleware)
      );
    }
  }

  async init() {
    await super.init();

    this.serveStatic = this.web.serveStatic;

    for (const action of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      this.addRoute(action);
    }
  }
}

Rest.rxMethodPath = /^(\w+)\s+(\S+)((\s*>\s*[^\s>]+)*)$/;
Rest.rxMiddleware = /[^\s>]+/g;
Rest.rxFollow = /[^.]+/g;

module.exports = Rest;
