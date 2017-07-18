const AutoInit = require('./auto-init');

class Rest extends AutoInit {
  // web -- webserver (class Web) instance

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

  async callHandler(handler, req) {
    let result;

    if (Object.getPrototypeOf(handler).constructor.name === 'AsyncFunction') {
      result = await handler.call(this, req);
    } else {
      result = await this.express(handler, req);
    }

    return result;
  }

  async processMiddlewares(names, req) {
    if (!names) return;

    for (const name of names) {
      const fields = name.match(Rest.rxFollow);
      let p = this.web;

      for (const field of fields) {
        p = p[field];
        if (!p) throw new Error(`Property ${field} not found in ${name} middleware`);
      }

      await this.callHandler(p, req); // eslint-disable-line
    }
  }

  wrapToMiddleware(handler, middleware) {
    return async (req, res, next) => {
      try {
        if (middleware) {
          const names = middleware.match(Rest.rxMiddleware);
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
    const [ents, method, path, middleware] = action.match(Rest.rxMethodPath) || [];
    if (!ents) return;
    const handler = customHandler || this[action];

    this.web.app[method.toLowerCase()](
      `${this.web.prefix}${path}`,
      this.wrapToMiddleware.call(this, handler, middleware)
    );
  }

  async init() {
    await super.init();

    for (const action of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      this.addRoute(action);
    }
  }
}

Rest.rxMethodPath = /^(\w+)\s+(\S+)(([\s>]+[^\s>]+)*)$/;
Rest.rxMiddleware = /[^\s>]+/g;
Rest.rxFollow = /[^.]+/g;

module.exports = Rest;
