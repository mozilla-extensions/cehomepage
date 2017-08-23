this.EXPORTED_SYMBOLS = ["NTabSync"];

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "FileUtils",
  "resource://gre/modules/FileUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS",
  "resource://gre/modules/osfile.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "NTabDB",
  "resource://ntab/NTabDB.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Tracking",
  "resource://ntab/Tracking.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "CommonUtils",
  "resource://services-common/utils.js");
XPCOMUtils.defineLazyModuleGetter(this, "CryptoWrapper",
  "resource://services-sync/record.js");
XPCOMUtils.defineLazyModuleGetter(this, "Store",
  "resource://services-sync/engines.js");
XPCOMUtils.defineLazyModuleGetter(this, "SyncEngine",
  "resource://services-sync/engines.js");
XPCOMUtils.defineLazyModuleGetter(this, "Tracker",
  "resource://services-sync/engines.js");
XPCOMUtils.defineLazyModuleGetter(this, "Weave",
  "resource://services-sync/main.js");

const NTAB_GUID = CommonUtils.encodeBase64URL(Services.appinfo.ID);

this.NTabRecord = function NTabRecord(collection, id) {
  CryptoWrapper.call(this, collection, id);
}
NTabRecord.prototype = {
  __proto__: CryptoWrapper.prototype,
  _logName: "Sync.Record.mozCN.NTab",
};
Weave.Utils.deferGetSet(NTabRecord, "cleartext", ["value"]);

this.NTabEngine = function(service) {
  SyncEngine.call(this, "mozCN.NTab", service);
}
NTabEngine.prototype = {
  __proto__: SyncEngine.prototype,
  _storeObj: NTabStore,
  _trackerObj: NTabTracker,
  _recordObj: NTabRecord,
  version: 1,

  _reconcile: function _reconcile(item) {
    let shouldApply = SyncEngine.prototype._reconcile.call(this, item);

    // clear |this._modified| here to prevent updating timestamp for no-op.
    if (shouldApply) {
      if (NTabSync.Changeset && this._modified instanceof NTabSync.Changeset) {
        this._modified.clear();
      } else {
        this._modified = {};
      }
    }

    return shouldApply;
  }
};


function NTabStore(name, engine) {
  Store.call(this, name, engine);
}
NTabStore.prototype = {
  __proto__: Store.prototype,

  getAllIDs() {
    let ids = {};
    if (NTabSync.stagedData) {
      ids[NTAB_GUID] = 0;
    }
    return ids;
  },

  changeItemID(oldID, newID) {
    this._log.trace("NTabStore GUID is constant!");
  },

  itemExists(id) {
    return (id === NTAB_GUID) && NTabSync.stagedData;
  },

  createRecord(id, collection) {
    let record = new NTabRecord(collection, id);

    /**
     * an empty record might be created and uploaded to sync storage server,
     * which should be ignored by other clients.
     */
    if (id === NTAB_GUID) {
      record.value = NTabSync.stagedData;
    } else {
      record.deleted = true;
    }

    return record;
  },

  create(record) {
    this.update(record);
  },

  remove(record) {
    this._log.trace("Ignoring remove request");
  },

  update(record) {
    if (record.id !== NTAB_GUID) {
      return;
    }

    this._log.trace("Received updates, applying...");
    NTabSync.stagedData = record.value;
    NTabSync.pendingImport = CommonUtils.generateUUID();
  },

  wipe() {
    this._log.trace("Ignoring wipe request");
  }
};

function NTabTracker(name, engine) {
  Tracker.call(this, name, engine);

  if (!NTabSync.prematureStartTracking) {
    return;
  }

  // Tracker.observe will take care of the enable status check
  this._log.trace("weave:engine:start-tracking, better late than never");
  delete NTabSync.prematureStartTracking;
  this.observe(null, "weave:engine:start-tracking", null);
}
NTabTracker.prototype = {
  __proto__: Tracker.prototype,

  startTracking() {
    NTabSync.mm.addMessageListener(NTabSync.messageName, this);

    NTabSync.findFirstBrowser(NTabSync.triggerContentUpload, NTabSync);
  },
  stopTracking() {
    NTabSync.mm.removeMessageListener(NTabSync.messageName, this);
  },

  receiveMessage(aMessage) {
    if (aMessage.name != NTabSync.messageName ||
        !aMessage.target.currentURI.equals(NTabDB.uri)) {
      return;
    }

    switch (aMessage.data.type) {
      case "ready":
        let readyState = aMessage.data.state;
        if (!readyState) {
          break;
        }

        NTabSync.backupData = readyState;

        if (NTabSync.pendingImport) {
          if (!NTabSync.stagedData) {
            // clear pendingImport here ?
            break;
          }

          NTabSync.triggerContentImport(aMessage.target);
        } else {
          /**
           * trigger upload once on offlintab ready, after that, only trigger
           * upload on offlintab update.
           */
          if (NTabSync.stagedData) {
            break;
          }

          NTabSync.stagedData = readyState;
          this._triggerUpload();
        }
        break;
      case "imported":
        let importedID = aMessage.data.id;
        if (!importedID) {
          break;
        }

        if (NTabSync.pendingImport === importedID) {
          NTabSync.pendingImport = "";
        } else {
          NTabSync.triggerContentImport(aMessage.target);
        }
        break;
      case "update":
        if (NTabSync.pendingImport) {
          this._log.trace("Pending import, ignore local changes");
          break;
        }

        let updatedState = aMessage.data.state;
        if (!updatedState || NTabSync.stagedData == updatedState) {
          break;
        }

        NTabSync.stagedData = updatedState;
        this._triggerUpload();
        break;
    }
  },

  _triggerUpload() {
    // use 0 (very old) to make sure remote changes always win
    this.addChangedID(NTAB_GUID, 0);
    this.score += Weave.SCORE_INCREMENT_XLARGE;
    this._log.trace("NTab data changed");
  }
};

let NTabSync = {
  messageName: "mozCNUtils:NTabSync",
  get Changeset() {
    let tmp = {};
    try {
      Cu.import("resource://services-sync/engines.js", tmp);
    } catch (ex) {}
    delete this.Changeset;
    return this.Changeset = tmp.Changeset;
  },
  get mm() {
    delete this.mm;
    return this.mm = Cc["@mozilla.org/globalmessagemanager;1"].
      getService(Ci.nsIMessageListenerManager);
  },

  get _stagedFile() {
    return FileUtils.getFile("ProfD", ["ntab", "sync", "staged.json"], false);
  },
  get stagedData() {
    if (!this._stagedData) {
      this._stagedData = this._loadData(this._stagedFile);
    }

    return this._stagedData;
  },
  set stagedData(data) {
    if (data) {
      this._stagedData = data;
      this._dumpData(this._stagedFile, data);
    }
  },

  get pendingImport() {
    return Weave.Svc.Prefs.get("engine.mozcn.ntab.pending", "");
  },
  set pendingImport(aPending) {
    Weave.Svc.Prefs.set("engine.mozcn.ntab.pending", aPending);

    if (aPending) {
      this.findFirstBrowser(this.triggerContentImport, this);
    }
  },

  get _backupFile() {
    return FileUtils.getFile("ProfD", ["ntab", "sync", "backup.json"], false);
  },
  set backupData(data) {
    if (!this._backupData) {
      this._backupData = this._loadData(this._backupFile);
    }

    /**
     * backup the offlintab state before applying anything coming from another
     * client via sync, make recovering from "data loss" possible
     */
    if (data && !this._backupData) {
      this._backupData = data;
      this._dumpData(this._backupFile, data);
    }
  },

  // no string <=> object conversion in _loadData/_dumpData
  _loadData(aFile) {
    let text = null;
    if (aFile.exists() && aFile.fileSize) {
      let fstream = Cc["@mozilla.org/network/file-input-stream;1"].
                      createInstance(Ci.nsIFileInputStream);
      fstream.init(aFile, -1, 0, 0);
      text = CommonUtils.readBytesFromInputStream(fstream, fstream.available());
      fstream.close();
      text = CommonUtils.decodeUTF8(text);
    }
    try {
      JSON.parse(text);
    } catch (e) {
      text = null;
      try {
        aFile.remove(false);
      } catch (e) {}
    }

    return text;
  },

  _dumpData(aFile, aData, aCallback) {
    OS.File.open(aFile.path, {
      append: false,
      truncate: true
    }).then(function(aFile) {
      let encoder = new TextEncoder();
      let data = encoder.encode(aData);
      aFile.write(data).then(() => {
        aFile.close().then(() => {
          if (aCallback) {
            aCallback();
          }
        });
      });
    }).then(null, Cu.reportError);
  },

  get strings() {
    let spec = "chrome://ntab/locale/sync.properties";
    delete this.strings;
    return this.strings = Services.strings.createBundle(spec);
  },

  _(key) {
    return this.strings.GetStringFromName(key);
  },

  addPrefs(win) {
    let self = this;
    win.mozCNNTabSync = {
      onSyncToEnablePref(checkbox) {
        let cbWin = checkbox.ownerGlobal;
        if (!checkbox.checked) {
          if (cbWin.mozCNSyncHack && cbWin.mozCNSyncHack.onSyncToEnablePref) {
            return cbWin.mozCNSyncHack.onSyncToEnablePref(checkbox);
          }
          return undefined;
        }
        let shouldEnable = Services.prompt.confirm(cbWin,
          self._("ntabsync.notification.title"),
          self._("ntabsync.notification.message"));

        if (!shouldEnable) {
          checkbox.checked = false;
        }

        return undefined;
      }
    };

    let doc = win.document;

    let prefs = doc.getElementById("syncEnginePrefs");
    let pref = doc.createElement("preference");
    pref.id = "engine.mozcn.ntab";
    pref.name = "services.sync.engine.mozcn.ntab";
    pref.type = "bool";
    prefs.appendChild(pref);

    let parentVBox = doc.querySelector("#fxaSyncEngines > vbox");
    if (!parentVBox) {
      return;
    }

    let checkbox = doc.createElement("checkbox");
    checkbox.setAttribute("label", this._("engine.mozcn.ntab.label"));
    checkbox.setAttribute("accesskey", this._("engine.mozcn.ntab.accesskey"));
    checkbox.setAttribute("preference", pref.id);
    checkbox.setAttribute("onsynctopreference",
      "return mozCNNTabSync.onSyncToEnablePref(this);");
    parentVBox.appendChild(checkbox);
  },

  findFirstBrowser(aCallback, aThisObj) {
    let winEnum = Services.wm.getEnumerator("navigator:browser");
    while (winEnum.hasMoreElements()) {
      let browserWin = winEnum.getNext();
      if (browserWin.closed) {
        continue;
      }

      let browsers = browserWin.gBrowser.browsers;
      for (let i = 0; i < browsers.length; i++) {
        let browser = browsers[i];
        if (browser.currentURI.equals(NTabDB.uri)) {
          if (aThisObj) {
            aCallback.call(aThisObj, browser);
          } else {
            aCallback(browser);
          }
          return;
        }
      }
    }
  },

  init() {
    Services.obs.addObserver(this, "sync-pane-loaded");
    Services.obs.addObserver(this, "weave:engine:start-tracking");
    Services.obs.addObserver(this, "weave:service:ready");
  },

  uninit() {
    Weave.Service.engineManager.unregister(NTabEngine.name);
    Services.obs.removeObserver(this, "sync-pane-loaded");
  },

  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "sync-pane-loaded":
        this.addPrefs(aSubject);
        break;
      case "weave:engine:start-tracking":
        this.prematureStartTracking = true;
        break;
      case "weave:service:ready":
        Services.obs.removeObserver(this, "weave:engine:start-tracking");
        Services.obs.removeObserver(this, "weave:service:ready");

        Weave.Service.engineManager.register(NTabEngine);
        break;
    }
  },

  triggerContentImport(aBrowser) {
    aBrowser.messageManager.sendAsyncMessage(this.messageName, {
      id: this.pendingImport,
      type: "update",
      state: this.stagedData
    });
  },

  triggerContentUpload(aBrowser) {
    aBrowser.messageManager.sendAsyncMessage(this.messageName, {
      id: Date.now(),
      type: "ready",
      state: this.stagedData
    });
  }
};
