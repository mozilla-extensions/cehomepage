var EXPORTED_SYMBOLS = ['QuickDialData'];

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
if (XPCOMUtils.hasOwnProperty('defineLazyModuleGetter')) {
  XPCOMUtils.defineLazyModuleGetter(this, "NetUtil",
    "resource://gre/modules/NetUtil.jsm");
  XPCOMUtils.defineLazyModuleGetter(this, "OS",
    "resource://gre/modules/osfile.jsm");
  XPCOMUtils.defineLazyModuleGetter(this, "Services",
    "resource://gre/modules/Services.jsm");
  XPCOMUtils.defineLazyModuleGetter(this, "FileUtils",
    "resource://gre/modules/FileUtils.jsm");
  XPCOMUtils.defineLazyModuleGetter(this, "quickDialModule",
    "resource://ntab/quickdial.jsm");
} else {
  Cu.import('resource://gre/modules/NetUtil.jsm');
  try {
    Cu.import('resource://gre/modules/osfile.jsm');
  } catch(e) {};
  Cu.import('resource://gre/modules/Services.jsm');
  Cu.import('resource://gre/modules/FileUtils.jsm');
  XPCOMUtils.defineLazyGetter(this, "quickDialModule", function () {
    let jsm = {};
    Cu.import('resource://ntab/quickdial.jsm', jsm);
    return jsm.quickDialModule;
  });
}
XPCOMUtils.defineLazyGetter(this, "gUnicodeConverter", function () {
  let converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
                    .createInstance(Ci.nsIScriptableUnicodeConverter);
  converter.charset = 'utf8';
  return converter;
});

let LOG = function(m) Services.console.logStringMessage(m);

let QuickDialData = {
  get prefs() {
    let branch = Services.prefs.getBranch('moa.ntab.dial.');
    delete this.prefs;
    return this.prefs = branch;
  },
  get verifier() {
    delete this.verifier;
    return this.verifier = Cc["@mozilla.org/security/datasignatureverifier;1"].
      getService(Ci.nsIDataSignatureVerifier);
  },

  get key() {
    delete this.key;
    return this.key = this._getCharPref('key', '');
  },
  get updateUrl() {
    let branch = this._getCharPref('branch', 'master-i');
    /* BEGIN ATTENTION
     *
     * divert existing users to different updateUrl
     * user pref will presist after extension update
     * maybe? remove this before merging 0.9.25.* with 0.9.26 branch
     */
    if (branch == 'master') {
      branch = 'master-i';
      try {
        this.prefs.setCharPref('branch', branch);
      } catch(e) {};
    }
    /* END ATTENTION */
    let updateUrl = ['http://ntab.firefoxchina.cn',
                     branch, 'quickdialdata.json'];
    delete this.updateUrl;
    return this.updateUrl = updateUrl.join('/');
  },

  get _bundleFile() {
    let uri = Services.io.newURI('resource://ntab/quickdialdata.json',
      null, null);
    return uri.QueryInterface(Ci.nsIFileURL).file;
  },
  get _latestFile() {
    return FileUtils.getFile('ProfLD', ['ntab', 'quickdialdata',
                                        'latest.json'], false);
  },
  get _defaultData() {
    return this._loadData(this._latestFile, true) ||
           this._loadData(this._bundleFile, false);
  },

  get _userFile() {
    return FileUtils.getFile('ProfD', ['ntab', 'quickdialdata',
                                       'user.json'], false);
  },

  _getCharPref: function(aPrefKey, aDefault) {
    let ret = aDefault;
    try {
      ret = this.prefs.getCharPref(aPrefKey);
    } catch(e) {}
    return ret;
  },

  _fetch: function(aUrl, aCallback) {
    if (!aUrl) {
      return;
    }
    let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
                .createInstance(Ci.nsIXMLHttpRequest);
    xhr.open('GET', aUrl, true);
    xhr.onload = function(evt) {
      if (xhr.status == 200) {
        let data = JSON.parse(xhr.responseText);
        aCallback(data);
      }
    };
    xhr.onerror = function(evt) {};
    xhr.send();
  },
  _validate: function(aData) {
    try {
      let data = aData.data;
      let signature = aData.signature;
      return this.verifier.verifyData(data, signature, this.key);
    } catch(e) {
      LOG(e);
      return false;
    }
  },

  _loadData: function(aFile, aFindBackup) {
    let text = null;
    if (aFile.exists() && aFile.fileSize) {
      let fstream = Cc['@mozilla.org/network/file-input-stream;1'].
                      createInstance(Ci.nsIFileInputStream);
      fstream.init(aFile, -1, 0, 0);
      text = NetUtil.readInputStreamToString(fstream, fstream.available());
      fstream.close();
      text = gUnicodeConverter.ConvertToUnicode(text);
    }
    try {
      text = JSON.parse(text);
    } catch(e) {
      text = null;
      try {
        aFile.remove(false);
      } catch(e) {};
    }

    if (aFindBackup) {
      let backup = aFile.clone();
      backup.leafName += '.bak';
      if (text) {
        /*
         * Only backup after a successful reading,
         * to avoid creating corrupt backup by repeated writing.
         */
        aFile.copyTo(null, backup.leafName);
      } else {
        text = this._loadData(backup, false);
        if (text) {
          try {
            backup.copyTo(null, aFile.leafName);
          } catch(e) {};
        }
      }
    }
    return text;
  },
  _dumpData: function(aFile, aData, aCallback) {
    aData = JSON.stringify(aData);

    try {
      // OS.File only available since Fx 16
      OS.File.open(aFile.path, {
        append: false,
        truncate: true
      }).then(function(aFile) {
        let encoder = new TextEncoder();
        let data = encoder.encode(aData);
        aFile.write(data).then(function() {
          aFile.close().then(function() {
            if (aCallback) {
              aCallback();
            }
          });
        });
      }).then(null, Cu.reportError);
    } catch(e) {
      let ostream = Cc["@mozilla.org/network/safe-file-output-stream;1"].
                      createInstance(Ci.nsIFileOutputStream);
      ostream.init(aFile, -1, -1, ostream.DEFER_OPEN);

      let istream = gUnicodeConverter.convertToInputStream(aData);
      NetUtil.asyncCopy(istream, ostream, function(aResult) {
        if (Components.isSuccessCode(aResult)) {
          if (aCallback) {
            aCallback();
          }
        }
      });
    }
  },

  _legacyMigration: function(aItem) {
    switch(aItem.url) {
      case "http://click.mz.simba.taobao.com/rd?w=mmp4ptest&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_9313996&k=e02915d8b8ad9603":
      case "http://click.mz.simba.taobao.com/rd?w=mmp4ptest&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_9313997&k=e02915d8b8ad9603":
      case "http://redirect.simba.taobao.com/rd?c=un&w=channel&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_9313997%26unid%3D&k=e02915d8b8ad9603&p=mm_28347190_2425761_9313997":
        aItem.url = "http://www.taobao.com/go/chn/tbk_channel/onsale.php?pid=mm_28347190_2425761_13466329&eventid=101329";
        break;
      case "http://click.union.360buy.com/JdClick/?unionId=206&siteId=8&to=http://www.360buy.com/":
      // remove item when counts per day < 10?
      // case "http://click.union.360buy.com/JdClick/?unionId=316&siteId=21946&to=http://www.360buy.com":
      case "http://click.union.360buy.com/JdClick/?unionId=20&siteId=433588__&to=http://www.360buy.com":
      case "http://www.yihaodian.com/?tracker_u=10977119545":
        if ((aItem.icon && aItem.icon.indexOf('chrome://') == 0) || aItem.rev) {
          aItem.url = "http://youxi.baidu.com/yxpm/pm.jsp?pid=11016500091_877110";
        }
        break;
      default:
        break;
    }

    delete aItem.icon;
    delete aItem.rev;
    delete aItem.thumbnail;

    return aItem;
  },
  _itemMigration: function(aItem) {
    switch(aItem.url) {
      case "http://count.chanet.com.cn/click.cgi?a=498315&d=365155&u=&e=&url=http%3A%2F%2Fwww.jd.com":
        aItem.url = "http://www.jd.com/";
        break;
      default:
        break;
    }

    return aItem;
  },
  _migrateUserData: function(aDefaultData) {
    let _legacyUserFile = FileUtils.getFile('ProfD',
                                            ['ntab', 'quickdial.json'], false);
    let legacyUserData = null;
    if (_legacyUserFile.exists() && !this._userFile.exists()) {
      try {
        let reverseLookup = {};
        for (let index in aDefaultData) {
          reverseLookup[aDefaultData[index].url] = index;
        }

        legacyUserData = this._loadData(_legacyUserFile, false);
        for (let index in legacyUserData) {
          let item = this._legacyMigration(legacyUserData[index]);
          legacyUserData[index] = reverseLookup[item.url] || item;
        }

        this._dumpData(this._userFile, legacyUserData);
        _legacyUserFile.remove(false);
      } catch(e) {
        LOG('Oops, migration failed: ' + e);
      }
    }
    return legacyUserData;
  },

  read: function() {
    let defaultData = this._defaultData;

    let userData = this._migrateUserData(defaultData) ||
                   this._loadData(this._userFile, true);

    let ret = {};
    if (userData) {
      for (let index in userData) {
        let item = userData[index];
        if (/^\d+$/.test(item)) {
          let defaultItem = defaultData[item];
          if (defaultItem) {
            defaultItem.defaultposition = item;
          }
          item = defaultItem;
        } else {
          item = this._itemMigration(item);
          userData[index] = item;
        }
        ret[index] = item;
      }
      this._dumpData(this._userFile, userData);
    } else {
      for (let index in defaultData) {
        let defaultItem = defaultData[index];
        defaultItem.defaultposition = index;
        ret[index] = defaultItem;
      }
    }
    return ret;
  },
  persist: function(aData) {
    let data = {}
    for (let index in aData) {
      data[index] = aData[index].defaultposition || aData[index];
    }
    this._dumpData(this._userFile, data);
  },
  reset: function() {
    if (this._userFile.exists()) {
      this._userFile.remove(false);

      quickDialModule.refresh();
    }
  },

  update: function() {
    let self = this;
    this._fetch(this.updateUrl, function(aData) {
      if (self._validate(aData)) {
        self._dumpData(self._latestFile, JSON.parse(aData.data), function() {
          quickDialModule.refresh();
        });
      }
    });

  }
};
