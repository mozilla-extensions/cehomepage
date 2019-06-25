this.EXPORTED_SYMBOLS = ["NTabDB"];

ChromeUtils.defineModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "XPCOMUtils",
  "resource://gre/modules/XPCOMUtils.jsm");

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
    let value = Services.scriptSecurityManager.
      createCodebasePrincipal(this.uri, {});
    Object.defineProperty(this, "principal", { value });
    return this.principal;
  }

  get localStorage() {
    this.storageManager.precacheStorage(this.principal);
    let value = this.storageManager.getStorage(null, this.principal);
    Object.defineProperty(this, "localStorage", { value });
    return this.localStorage;
  }

  get storageManager() {
    Object.defineProperty(this, "storageManager", {
      value: Services.domStorageManager
    });
    return this.storageManager;
  }

  exportFromLocalStorage() {
    let dataMap = new Map();
    for (let i = 0, l = this.localStorage.length; i < l; i++) {
      let key = this.localStorage.key(i);
      dataMap.set(key, this.localStorage.getItem(key));
    }
    return dataMap;
  }

  importIntoLocalStorage(dataMap) {
    for (let [aKey, aValue] of dataMap) {
      this.localStorage.setItem(aKey, aValue);
    }
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
      "https://newtab.firefoxchina.cn/"
    ].forEach(aSpec => {
      extraPrincipals.push(Services.scriptSecurityManager.
        createCodebasePrincipal(Services.io.newURI(aSpec), {}));
    });
    delete this.extraPrincipals;
    return this.extraPrincipals = extraPrincipals;
  },

  _backupAndRestoreLocalStorage() {
    // LSNG enabled since Fx 68: https://bugzil.la/1539835
    // Unable to update NTabDBInternal.localStorage to work with it yet
    if (Services.lsm && Services.lsm.nextGenLocalStorageEnabled) {
      return;
    }

    let dataMap = this._internalDB.exportFromLocalStorage();

    // Trigger the import asynchronously, after nsIDOMStorageManager's observe
    Services.tm.mainThread.dispatch(() => {
      this._internalDB.importIntoLocalStorage(dataMap);
    }, Ci.nsIThread.DISPATCH_NORMAL);
  },

  _initKeepLocalStorageOnClearingCookie() {
    Services.obs.addObserver(this, "cookie-changed");
  },

  _uninitKeepLocalStorageOnClearingCookie() {
    Services.obs.removeObserver(this, "cookie-changed");
  },

  _addPermission(aPrincipal) {
    let principal = aPrincipal || this._internalDB.principal;
    [
      Ci.nsIPermissionManager.ALLOW_ACTION,
      Ci.nsIOfflineCacheUpdateService.ALLOW_NO_WARN
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
    this._initKeepLocalStorageOnClearingCookie();
  },

  uninit() {
    this._uninitKeepLocalStorageOnClearingCookie();
  },

  /**
   * nsIDOMStorageManager will asynchronously clear the data on receiving
   * the notifications, so we have the chance to back them up here.
   */
  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "cookie-changed":
        if (aData !== "cleared") {
          break;
        }

        this._backupAndRestoreLocalStorage();
        break;
    }
  }
};
