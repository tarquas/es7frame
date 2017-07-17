class Cache {
  // maxLifetime : time in milliseconds after which to expire least recently used items
  // maxCount : time in milliseconds to expire least recently used items

  constructor({maxLifetime, maxCount}) {
    this.maxLifetime = maxLifetime;
    this.maxCount = maxCount;
    this.cache = {};
    this.nCache = 0;
  }

  processExpire({expireAfter, maxCount}) {
    for (const key in this.cache) {
      if (Object.hasOwnProperty.call(this.cache, key)) {
        const obj = this.cache[key];

        if (this.nCache > maxCount || expireAfter > obj.usedAt) {
          this.remove(key);
        } else break;
      }
    }
  }

  checkExpire() {
    if (!this.maxLifetime && !this.maxCount) return;
    const expireAfter = this.maxLifetime && (+new Date() - this.maxLifetime);
    this.processExpire({expireAfter, maxCount: this.maxCount});
  }

  add(key, object) {
    let obj = this.cache[key];
    if (obj) this.remove(key);
    else obj = {};
    obj.usedAt = new Date() - 0;
    if (object) obj.object = object;
    this.cache[key] = obj;
    this.nCache++;
    this.checkExpire();
  }

  remove(key) {
    delete this.cache[key];
    this.nCache--;
  }

  get(key) {
    const obj = this.cache[key];
    if (!obj) return null;
    obj.usedAt = new Date() - 0;
    return obj.object;
  }
}

module.exports = Cache;
