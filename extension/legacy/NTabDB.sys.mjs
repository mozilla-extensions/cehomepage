/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global globalThis */

class NTabDBInternal {
  constructor(prePath) {
    this.prePath = prePath;
  }

  get spec() {
    let value = this.prePath + "/";
    Object.defineProperty(this, "spec", { value });
    return this.spec;
  }

  get uri() {
    let value = Services.io.newURI(this.spec);
    Object.defineProperty(this, "uri", { value });
    return this.uri;
  }
}

let insecureNTabDB = new NTabDBInternal("http://offlintab.firefoxchina.cn");
let secureNTabDB = new NTabDBInternal("https://offlintab.firefoxchina.cn");

export let NTabDB = {
  get _internalDB() {
    let appinfo = Services.appinfo;
    let prefKey = "moa.ntab.useSecure";
    if (appinfo.processType !== appinfo.PROCESS_TYPE_DEFAULT) {
      delete this._internalDB;
      return this._internalDB = Services.prefs.getBoolPref(prefKey, false) ?
                                secureNTabDB : insecureNTabDB;
    }

    if (!Services.prefs.getBoolPref(prefKey, false)) {
      if (!appinfo.replacedLockTime) {
        Services.prefs.setBoolPref(prefKey, true);
      } else {
        delete this._internalDB;
        return this._internalDB = insecureNTabDB;
      }
    }
    delete this._internalDB;
    return this._internalDB = secureNTabDB;
  },
  get prePath() {
    delete this.prePath;
    return this.prePath = this._internalDB.prePath;
  },
  get spec() {
    delete this.spec;
    return this.spec = this._internalDB.spec;
  },
  get privateSpec() {
    delete this.privateSpec;
    return this.privateSpec = this.prePath + "/private.html";
  },
  get readOnlySpec() {
    delete this.readOnlySpec;
    return this.readOnlySpec = this.prePath + "/readonly.html";
  },
  get uri() {
    delete this.uri;
    return this.uri = this._internalDB.uri;
  },
};
