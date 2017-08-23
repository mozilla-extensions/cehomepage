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

let NTabDB = {
  prePath: "http://offlintab.firefoxchina.cn",
  get spec() {
    delete this.spec;
    return this.spec = this.prePath + "/";
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
    return this.uri = Services.io.newURI(this.spec);
  },
  get privateUri() {
    delete this.privateUri;
    return this.privateUri = Services.io.newURI(this.privateSpec);
  },
  get readOnlyUri() {
    delete this.readOnlyUri;
    return this.readOnlyUri = Services.io.newURI(this.readOnlySpec);
  },
  get principal() {
    delete this.principal;
    return this.principal = Services.scriptSecurityManager.
      createCodebasePrincipal(this.uri, {});
  },
  get extraPrincipals() {
    let extraPrincipals = [];
    [
      "http://newtab.firefoxchina.cn/"
    ].forEach(aSpec => {
      extraPrincipals.push(Services.scriptSecurityManager.
        createCodebasePrincipal(Services.io.newURI(aSpec), {}));
    });
    delete this.extraPrincipals;
    return this.extraPrincipals = extraPrincipals;
  },

  get localStorage() {
    this.storageManager.precacheStorage(this.principal);
    let localStorage = this.storageManager.getStorage(null, this.principal);
    delete this.localStorage;
    return this.localStorage = localStorage;
  },
  get storageManager() {
    delete this.storageManager;
    return this.storageManager = Cc["@mozilla.org/dom/localStorage-manager;1"].
      getService(Ci.nsIDOMStorageManager);
  },

  _backupAndRestoreLocalStorage() {
    let temp = new Map();
    for (let i = 0, l = this.localStorage.length; i < l; i++) {
      let key = this.localStorage.key(i);
      temp.set(key, this.localStorage.getItem(key));
    }

    // use |_executeSoon| to make this run after nsIDOMStorageManager's observe
    this._executeSoon(() => {
      temp.forEach((aValue, aKey) => {
        this.localStorage.setItem(aKey, aValue);
      });
    });
  },

  _executeSoon(callback) {
    if (!callback)
      return;
    Services.tm.mainThread.dispatch(callback, Ci.nsIThread.DISPATCH_NORMAL);
  },

  _initKeepLocalStorageOnClearingCookie() {
    Services.obs.addObserver(this, "cookie-changed");
  },

  _uninitKeepLocalStorageOnClearingCookie() {
    Services.obs.removeObserver(this, "cookie-changed");
  },

  _addPermission(aPrincipal) {
    let principal = aPrincipal || this.principal;
    [
      Ci.nsIPermissionManager.ALLOW_ACTION,
      Ci.nsIOfflineCacheUpdateService.ALLOW_NO_WARN
    ].forEach(aPerm => {
      Services.perms.addFromPrincipal(principal, "offline-app", aPerm);
    });
  },

  _addExtraPermission() {
    this.extraPrincipals.forEach(aPrincipal => {
      this._addPermission(aPrincipal);
    });
  },

  _initLocalStorage() {
    if (!this.localStorage) {
      this.localStorage = this.storageManager.
        createStorage(null, this.principal, this.spec);
    }
  },

  init() {
    this._addPermission();
    this._addExtraPermission();
    this._initKeepLocalStorageOnClearingCookie();
    this._initLocalStorage();
  },

  uninit() {
    this._uninitKeepLocalStorageOnClearingCookie();
  },

  getPref(aKey, aDefault) {
    try {
      let item = this.localStorage.getItem(aKey);
      if (typeof(item) === "string") {
        try {
          return JSON.parse(item);
        } catch (e) {}
      }
      return item || aDefault;
    } catch (e) {
      return aDefault;
    }
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
