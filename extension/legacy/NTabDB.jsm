this.EXPORTED_SYMBOLS = ["NTabDB"];

ChromeUtils.defineModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

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

  get principal() {
    // Since Fx 70, https://bugzil.la/1560455
    let value = Services.scriptSecurityManager.createContentPrincipal ?
      Services.scriptSecurityManager.createContentPrincipal(this.uri, {}) :
      Services.scriptSecurityManager.createCodebasePrincipal(this.uri, {});
    Object.defineProperty(this, "principal", { value });
    return this.principal;
  }
}

let insecureNTabDB = new NTabDBInternal("http://offlintab.firefoxchina.cn");
let secureNTabDB = new NTabDBInternal("https://offlintab.firefoxchina.cn");

let NTabDB = {
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
  get extraPrincipals() {
    let extraPrincipals = [];
    [
      "http://newtab.firefoxchina.cn/",
      "https://newtab.firefoxchina.cn/",
    ].forEach(aSpec => {
      let uri = Services.io.newURI(aSpec);
      // Since Fx 70, https://bugzil.la/1560455
      let principal = Services.scriptSecurityManager.createContentPrincipal ?
      Services.scriptSecurityManager.createContentPrincipal(uri, {}) :
      Services.scriptSecurityManager.createCodebasePrincipal(uri, {});

      extraPrincipals.push(principal);
    });
    delete this.extraPrincipals;
    return this.extraPrincipals = extraPrincipals;
  },

  _addPermission(aPrincipal) {
    let principal = aPrincipal || this._internalDB.principal;
    [
      Ci.nsIPermissionManager.ALLOW_ACTION,
      Ci.nsIOfflineCacheUpdateService.ALLOW_NO_WARN,
    ].forEach(aPerm => {
      Services.perms.addFromPrincipal(principal, "offline-app", aPerm);
    });
  },

  _addExtraPermission() {
    for (let aPrincipal of this.extraPrincipals) {
      this._addPermission(aPrincipal);
    }
  },

  init() {
    this._addPermission();
    this._addExtraPermission();
  },
};
