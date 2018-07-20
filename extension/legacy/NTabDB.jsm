let EXPORTED_SYMBOLS = ["NTabDB"];

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS",
  "resource://gre/modules/osfile.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PageThumbs",
  "resource://gre/modules/PageThumbs.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PageThumbsStorage",
  "resource://gre/modules/PageThumbs.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "getPref",
  "resource://ntab/mozCNUtils.jsm");

Cu.importGlobalProperties(["indexedDB"]);

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
    let value = Cc["@mozilla.org/dom/localStorage-manager;1"].
      getService(Ci.nsIDOMStorageManager);
    Object.defineProperty(this, "storageManager", { value });
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
  messageName: "mozCNUtils:NTabDB",
  get _internalDB() {
    if (!Services.prefs.getBoolPref("moa.ntab.useSecure", false)) {
      if (!insecureNTabDB.localStorage ||
          !insecureNTabDB.localStorage.length) {
        Services.prefs.setBoolPref("moa.ntab.useSecure", true);
      } else if (this._useDefaultDials) {
        let dataMap = insecureNTabDB.exportFromLocalStorage();
        secureNTabDB.importIntoLocalStorage(dataMap);

        Services.prefs.setBoolPref("moa.ntab.useSecure", true);
      } else {
        delete this._internalDB;
        return this._internalDB = insecureNTabDB;
      }
    }
    delete this._internalDB;
    return this._internalDB = secureNTabDB;
  },
  // `_useDefaultDials` is set based on messages from offlintab, and only
  // checked on subsequent initialization of `_internalDB`
  get _useDefaultDials() {
    return Services.prefs.getBoolPref("moa.ntab.useDefaultDials", false);
  },
  set _useDefaultDials(val) {
    Services.prefs.setBoolPref("moa.ntab.useDefaultDials", !!val);
  },
  get mm() {
    delete this.mm;
    return this.mm = Cc["@mozilla.org/globalmessagemanager;1"].
      getService(Ci.nsIMessageListenerManager || Ci.nsISupports);
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

    if (this.spec === secureNTabDB.spec) {
      return;
    }
    this.mm.addMessageListener(this.messageName, this);
  },

  uninit() {
    this._uninitKeepLocalStorageOnClearingCookie();

    if (this.spec === secureNTabDB.spec) {
      return;
    }
    this.mm.removeMessageListener(this.messageName, this);
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
  },

  receiveMessage(message) {
    if (message.name != this.messageName ||
        !message.target.currentURI.equals(this.uri)) {
      return;
    }

    this._useDefaultDials = message.data.useDefaultDials;
  }
};
