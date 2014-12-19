/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

try {
  Cu.importGlobalProperties(['Blob']);
} catch(e) {};

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "setTimeout",
  "resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "clearTimeout",
  "resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PageThumbs",
  "resource://gre/modules/PageThumbs.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PageThumbsStorage",
  "resource://gre/modules/PageThumbs.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS",
  "resource://gre/modules/osfile.jsm");

XPCOMUtils.defineLazyGetter(this, "WebChannel", function() {
  try {
    let temp = {};
    Cu.import("resource://gre/modules/WebChannel.jsm", temp);
    return temp.WebChannel;
  } catch(e) {
    return null;
  }
});

XPCOMUtils.defineLazyGetter(this, "BackgroundPageThumbs", function() {
  let temp = {};
  try {
    Cu.import("resource://gre/modules/BackgroundPageThumbs.jsm", temp);

    if (!BackgroundPageThumbs.captureIfMissing) {
      throw new Error("BackgroundPageThumbs not recent enough");
    }
  } catch(e) {
    /*
     * a local copy of BackgroundPageThumbs.jsm as in Fx 27.0.1, if
     * 1. resource://gre/modules/BackgroundPageThumbs.jsm does not exist;
     * 2. resource://gre/modules/BackgroundPageThumbs.jsm from esr24.
     */
    Cu.import("resource://ntab/BackgroundPageThumbs.jsm", temp);
  }
  return temp.BackgroundPageThumbs;
});

XPCOMUtils.defineLazyModuleGetter(this, "Frequent",
  "resource://ntab/History.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Session",
  "resource://ntab/History.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NTabDB",
  "resource://ntab/NTabDB.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NTabSync",
  "resource://ntab/NTabSync.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "delayedSuggestBaidu",
  "resource://ntab/SearchEngine.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "searchEngines",
  "resource://ntab/SearchEngine.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Tracking",
  "resource://ntab/Tracking.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Promo",
  "resource://cehp-promo/Promo.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "sessionStore",
  "@mozilla.org/browser/sessionstore;1",
  "nsISessionStore");

let jsm = {};
XPCOMUtils.defineLazyModuleGetter(jsm, "utils",
  "resource://ntab/utils.jsm");
let prefs = jsm.utils.prefs;

let homepage = {
  isCeHomepage: function() {
    let hp = prefs.getLocale('browser.startup.homepage', 'about:blank');
    let ceHp = prefs.getLocale('extensions.cehomepage.homepage', 'http://i.firefoxchina.cn');
    return hp == ceHp || hp == 'about:cehome';
  },
  /*reset: function() {
      prefs.set('browser.startup.homepage', this.cehomepage());
      prefs.set('browser.startup.page', 1);
    },
    homepage: function() {
      var hp = prefs.getLocale('browser.startup.homepage', 'about:blank');
      return hp;
    },
    homepage_changed: function() {
      return prefs.isSet('browser.startup.homepage') && this.homepage() != this.cehomepage();
    },
    page: function() {
      return prefs.get('browser.startup.page', 1);
    },
    page_changed: function() {
      return prefs.isSet('browser.startup.page') && this.page() == 1;
    },
    cehomepage: function() {
      return prefs.getLocale('extensions.cehomepage.homepage', 'http://i.firefoxchina.cn');
  },*/
    autostart: function(flag) {
      var ori = prefs.get('extensions.cehomepage.autostartup', true);
      if (typeof flag != 'undefined') {
          prefs.set('extensions.cehomepage.autostartup', flag);
      }
      return ori;
    },
    channelid: function() {
      return prefs.get('app.chinaedition.channel', 'www.firefox.com.cn');
    },
    setHome: function(aUrl) {
      if (aUrl != null && aUrl != '' && aUrl.indexOf('http://') == 0) {
        prefs.set('browser.startup.homepage', aUrl);
        prefs.set('browser.startup.page', 1);
      } else {
        this.reset();
      }
    }
};

function queryBookmarks(aCallback) {
  let db = Cc['@mozilla.org/browser/nav-history-service;1'].
             getService(Ci.nsINavHistoryService).
             QueryInterface(Ci.nsPIPlacesDatabase).
             DBConnection;
  let sql = ('SELECT b.title as title, p.url as url ' +
             'FROM moz_bookmarks b, moz_places p ' +
             'WHERE b.type = 1 AND b.fk = p.id AND p.hidden = 0');
  let statement = db.createAsyncStatement(sql);
  let links = [];
  db.executeAsync([statement], 1, {
    handleResult: function(aResultSet) {
      let row;

      while (row = aResultSet.getNextRow()) {
        let title = row.getResultByName("title");
        let url = row.getResultByName("url");

        links.push({
          title: title,
          url: url,
          __exposedProps__: {
            title: "r",
            url: "r"
          }
        });
      }
    },
    handleError: (aError) => aCallback([]),
    handleCompletion: (aReason) => aCallback(links)
  });
}

function getThumbnail(aUrl, aSuccessCallback, aErrorCallback) {
  /* We will have to back port this to previous Fx versions
   * use capture instead of captureIfMissing to force generate the
   * good looking version.
   */
  BackgroundPageThumbs.capture(aUrl, {
    onDone: () => {
      let path = '';
      if (PageThumbs.getThumbnailPath) {
        path = PageThumbs.getThumbnailPath(aUrl);
      } else {
        path = PageThumbsStorage.getFilePathForURL(aUrl);
      }
      OS.File.read(path).then((aData) => {
        let blob = new Blob([aData], {
          type: PageThumbs.contentType
        });
        aSuccessCallback(blob);
      }, (aError) => aErrorCallback(aError));
    }
  });
}

function getChannel() {
  let channel = 'master-ii';
  try {
    channel = Services.prefs.getCharPref("moa.ntab.dial.branch");
  } catch(e) {}

  return channel;
}

let fxAccountsProxy = {
  messageName: "mozCNUtils:FxAccounts",
  mutationConfig: {
    attributes: true,
    attributeFilter: [
      "disabled",
      "failed",
      "hidden",
      "label",
      "signedin",
      "status",
      "tooltiptext"
    ]
  },
  maybeRegisterMutationObserver: function(aWindow) {
    let gFxAccounts = aWindow.gFxAccounts;
    let windowMM = aWindow.messageManager;

    if (!gFxAccounts || !gFxAccounts.button || !windowMM) {
      return;
    }

    let self = this;
    let config = this.mutationConfig;
    let observer = new aWindow.MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type != "attributes" ||
            mutation.target != gFxAccounts.button ||
            config.attributeFilter.indexOf(mutation.attributeName) < 0) {
          return;
        }

        windowMM.broadcastAsyncMessage(self.messageName, "mutation", mutation);
      });
    });

    observer.observe(gFxAccounts.button, config);
  },
  maybeInitContentButton: function(aBrowser) {
    let gFxAccounts = aBrowser.ownerGlobal &&
                      aBrowser.ownerGlobal.gFxAccounts;
    let browserMM = aBrowser.messageManager;

    if (!gFxAccounts || !gFxAccounts.button || !browserMM) {
      return;
    }

    browserMM.sendAsyncMessage(this.messageName, "init", gFxAccounts.button);
  }
};

let appcacheTempFix = {
  attribute: "mozCNAppcacheTempFix",
  delay: 3e3,
  fixApplied: false,

  get appCacheService() {
    delete this.appCacheService;
    return this.appCacheService =
      Cc["@mozilla.org/network/application-cache-service;1"].
        getService(Ci.nsIApplicationCacheService);
  },

  clear: function(aHost) {
    let groups = this.appCacheService.getGroups();
    for (let i = 0; i < groups.length; i++) {
      let uri = Services.io.newURI(groups[i], null, null);
      if (uri.asciiHost == aHost) {
        let cache = this.appCacheService.getActiveCache(groups[i]);
        cache.discard();
      }
    }
    this.fixApplied = true;

    Tracking.track({
      type: "appcache",
      action: "clear",
      sid: "dummy"
    });
  },

  attach: function(aBrowser, aRequest) {
    this.remove(aBrowser, aRequest);
    if (this.fixApplied) {
      return;
    }

    let timeoutId = setTimeout((function() {
      this.clear(aRequest.URI.asciiHost);

      aRequest.cancel(Cr.NS_BINDING_ABORTED);
      aBrowser.webNavigation.loadURI(aRequest.URI.spec, null, null, null, null);
    }).bind(this), this.delay);
    aBrowser.setAttribute(this.attribute, timeoutId);
  },

  remove: function(aBrowser, aRequest) {
    if (aBrowser.hasAttribute(this.attribute)) {
      let timeoutId = aBrowser.getAttribute(this.attribute);
      aBrowser.removeAttribute(this.attribute);
      clearTimeout(parseInt(timeoutId, 10));
    }
  }
}

function mozCNUtils() {}

mozCNUtils.prototype = {
  classID: Components.ID("{828cb3e4-a050-4f95-8893-baa0b00da7d7}"),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsIMessageListener]),

  // nsIObserver
  observe: function(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "profile-after-change":
        Services.obs.addObserver(this, "browser-delayed-startup-finished", false);
        Services.obs.addObserver(this, "http-on-examine-response", false);
        Services.obs.addObserver(this, "http-on-examine-cached-response", false);
        Services.obs.addObserver(this, "http-on-examine-merged-response", false);
        Services.obs.addObserver(this, "keyword-search", false);
        WebChannel ?
          this.initPageAccess() :
          Services.obs.addObserver(this, "document-element-inserted", false);
        this.initNTab();
        NTabDB.migrateNTabData();
        this.initMessageListener();
        delayedSuggestBaidu.init();
        searchEngines.init();
        NTabSync.init();
        Promo.init();
        break;
      case "browser-delayed-startup-finished":
        this.initProgressListener(aSubject);
        searchEngines.patchBrowserSearch(aSubject);
        fxAccountsProxy.maybeRegisterMutationObserver(aSubject);
        break;
      case "http-on-examine-response":
      case "http-on-examine-cached-response":
      case "http-on-examine-merged-response":
        this.trackHTTPStatus(aSubject, aTopic);
        break;
      case "document-element-inserted":
        this.injectMozCNUtils(aSubject);
        break;
      case "keyword-search":
        searchEngines.trackUsage(aSubject, "urlbar");
        break;
    }
  },

  initPageAccess: function() {
    let globalMM = Cc['@mozilla.org/globalmessagemanager;1']
                     .getService(Ci.nsIMessageListenerManager);
    globalMM.loadFrameScript('chrome://cehomepage/content/pageAccessFrameScript.js', true);
  },

  initNTab: function() {
    let globalMM = Cc['@mozilla.org/globalmessagemanager;1']
                     .getService(Ci.nsIMessageListenerManager);
    globalMM.loadFrameScript('chrome://ntab/content/ntabContent.js', true);
    globalMM.addMessageListener('NTab:NTabDocumentCreated', function(aMessage) {
     fxAccountsProxy.maybeInitContentButton(aMessage.target);
    });
  },

  trackHTTPStatus: function(aSubject, aTopic) {
    let channel = aSubject;
    channel.QueryInterface(Ci.nsIHttpChannel);

    if ([
      NTabDB.uri.prePath,
      "http://i.g-fox.cn",
      "http://i.firefoxchina.cn"
    ].indexOf(channel.URI.prePath) == -1 ||
        !(channel.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI)) {
      return;
    }

    if ([200, 302, 304].indexOf(channel.responseStatus) == -1) {
      Tracking.track({
        type: "http-status",
        sid: channel.responseStatus,
        action: aTopic,
        href: channel.URI.spec,
        altBase: "http://robust.g-fox.cn/ntab.gif"
      });
    }
  },

  // nsIMessageListener
  receiveMessage: function(aMessage) {
    if (this.MESSAGES.indexOf(aMessage.name) < 0 ||
        !aMessage.target.currentURI.equals(NTabDB.uri)) {
      return;
    }

    let w = aMessage.target.ownerGlobal;

    switch (aMessage.name) {
      case "mozCNUtils:FxAccounts":
        w.gFxAccounts.onMenuPanelCommand(aMessage.objects)
        break;
      case "mozCNUtils:Tools":
        switch (aMessage.data) {
          case "downloads":
            w.BrowserDownloadsUI();
            break;
          case "bookmarks":
            w.PlacesCommandHook.showPlacesOrganizer("AllBookmarks");
            break;
          case "history":
            w.PlacesCommandHook.showPlacesOrganizer("History");
            break;
          case "addons":
            w.BrowserOpenAddonsMgr();
            break;
          case "sync":
            // FIXME
            w.openPreferences("paneSync");
            break;
          case "settings":
            w.openPreferences();
            break;
        }
        break;
    }
  },

  MESSAGES: [
    "mozCNUtils:FxAccounts",
    "mozCNUtils:Tools"
  ],
  initMessageListener: function() {
    let mm = Cc["@mozilla.org/globalmessagemanager;1"].
               getService(Ci.nsIMessageListenerManager);

    for (let msg of this.MESSAGES) {
      mm.addMessageListener(msg, this);
    }
  },

  // TabsProgressListener variant of nsIWebProgressListener
  onStateChange: function(aBrowser, b, aRequest, aStateFlags, aStatus) {
    if (aStateFlags & Ci.nsIWebProgressListener.STATE_IS_WINDOW) {
      let isStart = aStateFlags & Ci.nsIWebProgressListener.STATE_START;
      let isStop = aStateFlags & Ci.nsIWebProgressListener.STATE_STOP;
      if (!isStart && !isStop) {
        return;
      }

      if (NTabDB.uri.equals(aRequest.URI)) {
        if (isStart) {
          appcacheTempFix.attach(aBrowser, aRequest);
        }
        if (isStop) {
          appcacheTempFix.remove(aBrowser, aRequest);
        }
      }

      if (delayedSuggestBaidu.isGoogleSearch(aRequest.URI)) {
        if (isStart) {
          delayedSuggestBaidu.attach(aBrowser, aRequest);
        }
        if (isStop) {
          delayedSuggestBaidu.remove(aBrowser, aRequest);
        }
      }
    }
  },

  onLocationChange: function(aBrowser, b, aRequest, aLocation, aFlags) {
    if (aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_ERROR_PAGE) {
      // before we can fix the OfflineCacheInstaller ?
      if (aLocation.equals(NTabDB.uri)) {
        aRequest.cancel(Cr.NS_BINDING_ABORTED);
        aBrowser.webNavigation.loadURI("about:blank", null, null, null, null);
      }
    }
  },

  initProgressListener: function(aSubject) {
    aSubject.gBrowser.addTabsProgressListener(this);
  },

  injectMozCNUtils: function(aSubject) {
    try {
      let w = aSubject.defaultView;

      this.attachToWindow(w);
    } catch(e) {}
  },

  attachToWindow: function(aWindow) {
    let docURI = aWindow.document.documentURIObject;

    let baseDomain = Services.eTLD.getBaseDomain(docURI);
    if (baseDomain !== "firefoxchina.cn") {
      return;
    }

    /*
     * from cehomepage @ chrome/content/history.js
     * figure out which ones are actually used
     */
    let mozCNUtilsObj = {
      frequent: {
        enumerable: true,
        configurable: true,
        writable: true,
        value: {
          queryAsync: function(aLimit, aCallback) {
            Frequent.query(function(aEntries) {
              aEntries.forEach(function(aEntry) {
                aEntry.__exposedProps__ = {
                  title: "r",
                  url: "r"
                }
              });
              aCallback(aEntries);
            }, aLimit);
          },
          remove: function(aUrl) {
            Frequent.remove([aUrl]);
          },
          __exposedProps__: {
            queryAsync: "r",
            remove: "r"
          }
        }
      },

      last: {
        enumerable: true,
        configurable: true,
        writable: true,
        value: {
          queryAsync: function(aLimit, aCallback) {
            Session.query(function(aEntries) {
              aEntries.forEach(function(aEntry) {
                aEntry.__exposedProps__ = {
                  title: "r",
                  url: "r"
                }
              });
              aCallback(aEntries);
            }, aLimit);
          },
          remove: function(aUrl) {
            Session.remove([aUrl]);
          },
          __exposedProps__: {
            queryAsync: "r",
            remove: "r"
          }
        }
      },

      sessionStore: {
        enumerable: true,
        configurable: true,
        writable: true,
        value: {
          get canRestoreLastSession() {
            return sessionStore.canRestoreLastSession;
          },
          restoreLastSession: function() {
            if (sessionStore.canRestoreLastSession) {
              sessionStore.restoreLastSession();
            }
          },
          __exposedProps__: {
            canRestoreLastSession: "r",
            restoreLastSession: "r"
          }
        }
      },

      startup: {
        enumerable: true,
        configurable: true,
        writable: true,
        value: {
          homepage: function() {
            return homepage.homepage()
          },
          homepage_changed: function() {
            return homepage.homepage_changed();
          },
          page: function() {
            return homepage.page();
          },
          page_changed: function() {
            return homepage.page_changed();
          },
          cehomepage: function() {
            return homepage.cehomepage();
          },
          autostart: function(aFlag) {
            return homepage.autostart(aFlag)
          },
          channelid: function() {
            return homepage.channelid();
          },
          setHome: function(aUrl) {
            homepage.setHome(aUrl);
          },
          __exposedProps__: {
            homepage: "r",
            homepage_changed: "r",
            page: "r",
            page_changed: "r",
            cehomepage: "r",
            autostart: "r",
            channelid: "r",
            setHome: "r"
          }
        }
      },

      // for offlintab
      bookmarks: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: {
          queryAsync: function(aCallback) {
            queryBookmarks(aCallback);
          },
          __exposedProps__: {
            queryAsync: "r"
          }
        }
      },

      thumbs: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: {
          getThumbnail: function(aUrl) {
            let request = Services.DOMRequest.createRequest(aWindow);

            getThumbnail(aUrl,
              (aBlob) => Services.DOMRequest.fireSuccess(request, aBlob),
              (aError) => Services.DOMRequest.fireError(request, 'OS.File'));

            return request;
          },
          __exposedProps__: {
            getThumbnail: "r"
          }
        }
      },

      variant: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: {
          get channel() {
            return getChannel();
          },
          __exposedProps__: {
            channel: "r"
          }
        }
      },

      searchEngine: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: {
          isBaidu: function() {
            return SearchEngines.isBaidu();
          },
          switchToBaidu: function() {
            SearchEngines.switchToBaidu();
          },
          __exposedProps__: {
            maybeEnableSwitchToBaidu: "r"
          }
        }
      }
    };

    let contentObj = Cu.createObjectIn(aWindow);
    Object.defineProperties(contentObj, mozCNUtilsObj);
    Cu.makeObjectPropsNormal(contentObj);

    aWindow.wrappedJSObject.__defineGetter__("mozCNUtils", function() {
      delete aWindow.wrappedJSObject.mozCNUtils;
      return aWindow.wrappedJSObject.mozCNUtils = contentObj;
    });
  }
};

let mozCNChannel = {
  _webChannelId: 'moz_cn_channel',
  _channels: {
    'i.firefoxchina.cn': null,
    'newtab.firefoxchina.cn': null,
    'offlintab.firefoxchina.cn': null
  },
  _listener: function(aWebChannelId, aMessage, aSender) {
    if (aWebChannelId != this._webChannelId || !aMessage) return;

    let key = aMessage.key;
    let p = aMessage.parameters;
    switch (key) {
      case 'frequent.query': {
        let {limit} = p;
        Frequent.query((aEntries) => this._send(key, aEntries, aSender), limit);
        break;
      }
      case 'frequent.remove': {
        let {url} = p;
        Frequent.remove([url]);
        break;
      }
      case 'last.query': {
        let {limit} = p;
        Session.query((aEntries) => this._send(key, aEntries, aSender), limit);
        break;
      }
      case 'last.remove': {
        let {url} = p;
        Session.remove([url]);
        break;
      }
      case 'sessionStore.canRestoreLastSession': {
        this._send(key, sessionStore.canRestoreLastSession, aSender);
        break;
      }
      case 'sessionStore.restoreLastSession': {
        if (sessionStore.canRestoreLastSession) {
          sessionStore.restoreLastSession();
        }
        break;
      }
      case 'startup.homepage': {
        this._send(key, homepage.homepage(), aSender);
        break;
      }
      case 'startup.homepage_changed': {
        this._send(key, homepage.homepage_changed(), aSender);
        break;
      }
      case 'startup.page': {
        this._send(key, homepage.page(), aSender);
        break;
      }
      case 'startup.page_changed': {
        this._send(key, homepage.page_changed(), aSender);
        break;
      }
      case 'startup.cehomepage': {
        this._send(key, homepage.cehomepage(), aSender);
        break;
      }
      case 'startup.autostart': {
        let {flag} = p;
        this._send(key, homepage.autostart(flag), aSender);
        break;
      }
      case 'startup.channelid': {
        this._send(key, homepage.channelid(), aSender);
        break;
      }
      case 'startup.setHome': {
        let {url} = p;
        homepage.setHome(url);
        break;
      }
      case 'bookmark.query': {
        queryBookmarks((aLinks) => this._send(key, aLinks, aSender));
        break;
      }
      case 'thumbs.getThumbnail': {
        let {url} = p;

        getThumbnail(url,
          (aBlob) => this._send(key, {
            url: url,
            blob: aBlob
          }, aSender),
          (aError) => {
            Cu.reportError(aError);
            this._send(key, null, aSender);
          }
        )
        break;
      }
      case 'variant.channel': {
        this._send(key, getChannel(), aSender);
        break;
      }
      case 'searchEngine.isBaidu': {
        this._send(key, SearchEngine.isBaidu(), aSender);
          }
      case 'searchEngine.switchToBaidu': {
        SearchEngine.switchToBaidu();
      }
    }
  },
  _send: function(aKey, aData, aSender) {
    this._channels[aSender.currentURI.host].send({
      key: aKey,
      data: aData
    }, aSender);
  },
  registerChannel: function() {
    for (let origin in this._channels) {
      let channel = this._channels[origin] = new WebChannel(this._webChannelId, Services.io.newURI('http://' + origin, null, null));
      channel.listen(this._listener.bind(this));
    }
  },
};

if (WebChannel) {
  mozCNChannel.registerChannel();
}

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([mozCNUtils]);
