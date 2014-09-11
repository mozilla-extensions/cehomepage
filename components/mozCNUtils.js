/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let Cu = Components.utils;
let Cr = Components.results;
let Ci = Components.interfaces;
let Cc = Components.classes;

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
XPCOMUtils.defineLazyModuleGetter(this, "Tracking",
  "resource://ntab/Tracking.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "sessionStore",
  "@mozilla.org/browser/sessionstore;1",
  "nsISessionStore");
XPCOMUtils.defineLazyGetter(this, "CETracking", function() {
  try {
    return Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject;
  } catch(e) {};
});

let delayedSuggestBaidu = {
  attribute: "mozCNDelayedSuggestBaidu",
  delay: 10e3,
  icon: "chrome://ntab/skin/delayed-suggest-baidu.png",
  knownStatus: [Cr.NS_ERROR_NET_RESET, Cr.NS_ERROR_NET_TIMEOUT],
  notificationKey: "mozcn-delayed-suggest-baidu",
  prefKey: "moa.delayedsuggest.baidu",
  version: 1, // bump this to ignore existing nomore

  get baidu() {
    delete this.baidu;
    return this.baidu = Services.search.getEngineByName("\u767e\u5ea6");
  },

  get bundle() {
    let url = "chrome://ntab/locale/overlay.properties";
    delete this.bundle;
    return this.bundle = Services.strings.createBundle(url);
  },

  get enabled() {
    let currentVersion = 0;
    try {
      currentVersion = Services.prefs.getIntPref(this.prefKey);
    } catch(e) {}
    return (currentVersion < this.version) && this.baidu;
  },

  init: function() {
    Services.search.init();
  },

  isGoogleSearch: function(aURI) {
    try {
      let publicSuffix = Services.eTLD.getPublicSuffix(aURI);
      let hostMatch = ["google.", "www.google."].some(function(aPrefix) {
        return (aPrefix + publicSuffix) == aURI.asciiHost;
      });

      if (!hostMatch) {
        return false;
      }
    } catch(e) {
      return false;
    }

    return (aURI.path == "/" || aURI.path.startsWith("/search?"));
  },

  attach: function(aBrowser, aRequest) {
    this.remove(aBrowser, aRequest);
    if (!this.enabled) {
      return;
    }

    let timeoutId = setTimeout((function() {
      this.notify(aBrowser, aRequest);
    }).bind(this), this.delay);
    aBrowser.setAttribute(this.attribute, timeoutId);
  },

  remove: function(aBrowser, aRequest) {
    if (aBrowser.hasAttribute(this.attribute)) {
      let timeoutId = aBrowser.getAttribute(this.attribute);
      aBrowser.removeAttribute(this.attribute);
      clearTimeout(parseInt(timeoutId, 10));
    }

    if (this.knownStatus.indexOf(aRequest.status) < 0) {
      let gBrowser = aBrowser.ownerGlobal.gBrowser;
      let notificationBox = gBrowser.getNotificationBox(aBrowser);
      let notification = notificationBox.
        getNotificationWithValue(this.notificationKey);
      if (notification) {
        notificationBox.removeNotification(notification);
      }
    }
  },

  extractKeyword: function(aURI) {
    let keyword = "";

    try {
      let query = aURI.QueryInterface(Ci.nsIURL).query;

      if (query) {
        query.split("&").some(function(aChunk) {
          let pair = aChunk.split("=");

          let match = pair[0] == "q";
          if (match) {
            keyword = decodeURIComponent(pair[1]).replace(/\+/g, " ");
          }
          return match;
        })
      }
    } catch(e) {}

    return keyword;
  },

  notify: function(aBrowser, aRequest) {
    if (!this.enabled) {
      return;
    }

    let keyword = this.extractKeyword(aRequest.URI);

    let gBrowser = aBrowser.ownerGlobal.gBrowser;
    let notificationBox = gBrowser.getNotificationBox(aBrowser);

    let self = this;
    let prefix = "delayedsuggestbaidu.notification.";
    let message = this.bundle.GetStringFromName(prefix + "message");
    let positive = this.bundle.GetStringFromName(prefix + "positive");
    let negative = this.bundle.GetStringFromName(prefix + "negative");

    let notificationBar = notificationBox.appendNotification(message,
      this.notificationKey,
      this.icon,
      notificationBox.PRIORITY_INFO_HIGH,
      [{
        label: positive,
        accessKey: "Y",
        callback: function() {
          self.searchAndSwitchEngine(aBrowser, keyword);
        }
      }, {
        label: negative,
        accessKey: "N",
        callback: function() {
          self.markNomore()
        }
      }]);
    notificationBar.persistence = 1;
    Tracking.track({
      type: "delayedsuggestbaidu",
      action: "notify",
      sid: "dummy"
    });
  },

  searchAndSwitchEngine: function(aBrowser, aKeyword) {
    let w = aBrowser.ownerGlobal;
    if (aKeyword) {
      let submission = this.baidu.getSubmission(aKeyword);
      // always replace in the current tab
      w.openUILinkIn(submission.uri.spec, "current", null, submission.postData);
    } else {
      w.openUILinkIn(this.baidu.searchForm, "current");
    }

    if (Services.search.currentEngine.name == "Google") {
      this.baidu.hidden = false;
      Services.search.currentEngine = this.baidu;

      Tracking.track({
        type: "delayedsuggestbaidu",
        action: "click",
        sid: "switch"
      });
    }

    Tracking.track({
      type: "delayedsuggestbaidu",
      action: "click",
      sid: "search"
    });
  },

  markNomore: function() {
    try {
      Services.prefs.setIntPref(this.prefKey, this.version);
    } catch(e) {}

    Tracking.track({
      type: "delayedsuggestbaidu",
      action: "click",
      sid: "nomore"
    });
  }
};

let nxDomainHijack = {
  _cachedIPs: {},
  _TLDs: ["com", "org", "net", "int", "edu"],

  get dnsService() {
    delete this.dnsService;
    return this.dnsService = Cc["@mozilla.org/network/dns-service;1"].
      getService(Ci.nsIDNSService);
  },

  get dnsResolveFlag() {
    delete this.dnsResolveFlag;
    return this.dnsResolveFlag = (this.dnsService.RESOLVE_BYPASS_CACHE |
      this.dnsService.RESOLVE_CANONICAL_NAME |
      this.dnsService.RESOLVE_PRIORITY_MEDIUM |
      this.dnsService.RESOLVE_DISABLE_IPV6);
  },

  get httpPort() {
    delete this.httpPort;
    return this.httpPort = Cc["@mozilla.org/network/protocol;1?name=http"].
      getService(Ci.nsIHttpProtocolHandler).defaultPort;
  },

  _generateRandomHost: function(aTLD) {
    let ret = [aTLD];
    let choices = "abcdefghijklmnopqrstuvwxyz0123456789";
    let parts = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < parts; i++) {
      let l = 12 + Math.round(4 * Math.cos(Math.PI * Math.random()));
      let tmp = "";
      for (let j = 0; j < l; j++) {
        tmp += choices[Math.floor(choices.length * Math.random())];
      }
      ret.unshift(tmp);
    }
    return ret.join(".");
  },

  init: function() {
    let self = this;
    this._TLDs.forEach(function(aTLD) {
      self.dnsService.asyncResolve(self._generateRandomHost(aTLD),
        self.dnsResolveFlag, self, Services.tm.mainThread);
    });
  },

  /**
   * swap32, ntohl, htonl, stringToIP from /dom/system/gonk/systemlibs.js
   * see http://mzl.la/1CPFXYl#>>>_(Zero-fill_right_shift) for use of ">>>"
   */
  swap32: function(n) {
    return ((((n >>> 24) & 0xFF) <<  0) |
            (((n >>> 16) & 0xFF) <<  8) |
            (((n >>>  8) & 0xFF) << 16) |
            (((n >>>  0) & 0xFF) << 24)) >>> 0;
  },

  ntohl: function(n) {
    return this.swap32(n);
  },

  htonl: function(n) {
    return this.swap32(n);
  },

  stringToIP: function(string) {
    if (!string) {
      return null;
    }
    let ip = 0;
    let start, end = -1;
    for (let i = 0; i < 4; i++) {
      start = end + 1;
      end = string.indexOf(".", start);
      if (end == -1) {
        end = string.length;
      }
      let num = parseInt(string.slice(start, end), 10);
      if (isNaN(num)) {
        return null;
      }
      ip |= num << (i * 8);
    }
    return (ip >>> 0);
  },

  // isLoopBackAddress, isIPAddrLocal (IPv4 only) from /network/dns/DNS.cpp
  isLoopBackAddress: function(aNetAddr) {
    if (aNetAddr.family == aNetAddr.FAMILY_INET) {
      return (this.stringToIP(aNetAddr.address) == this.htonl(0x7f000001));
    }

    return false;
  },

  isIPAddrLocal: function(aNetAddr) {
    if (aNetAddr.family == aNetAddr.FAMILY_INET) {
      let addr32 = this.ntohl(this.stringToIP(aNetAddr.address));
      if (addr32 >>> 24 == 0x0A ||    // 10/8 prefix (RFC 1918).
          addr32 >>> 20 == 0xAC1 ||   // 172.16/12 prefix (RFC 1918).
          addr32 >>> 16 == 0xC0A8 ||  // 192.168/16 prefix (RFC 1918).
          addr32 >>> 16 == 0xA9FE) {  // 169.254/16 prefix (Link Local).
        return true;
      }
    }

    return false;
  },

  onLookupComplete: function(aRequest, aRecord, aStatus) {
    if (!aRecord) {
      switch(aStatus) {
        case Cr.NS_ERROR_UNKNOWN_HOST:
          // no nxdomain hijack, hooray!
          break;
        case Cr.NS_ERROR_DNS_LOOKUP_QUEUE_FULL:
          try {
            CETracking.track("nxdomain-dns-queue");
          } catch(e) {};
          break;
        default:
          Services.console.logStringMessage(aStatus);
      }
      return;
    }

    while (aRecord.hasMore()) {
      let netAddr = aRecord.getScriptableNextAddr(this.httpPort);
      if (this.isLoopBackAddress(netAddr) || this.isIPAddrLocal(netAddr)) {
        continue;
      }

      let addr = netAddr.address;
      this._cachedIPs[addr] = (this._cachedIPs[addr] || 0) + 1;
    }
  },

  isSuspiciousAddr: function(aAddr) {
    return (this._cachedIPs[aAddr] || 0) >= Math.ceil(this._TLDs.length / 2);
  },

  detect: function(aSubject) {
    let channel = aSubject;
    channel.QueryInterface(Ci.nsIHttpChannel);

    if (channel.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI) {
      try {
        channel.QueryInterface(Ci.nsIHttpChannelInternal);
        if (!this.isSuspiciousAddr(channel.remoteAddress)) {
          return;
        }

        let ip = this.ntohl(this.stringToIP(channel.remoteAddress));
        try {
          CETracking.track("nxdomain-" + ip.toString(16));
        } catch(e) {};
      } catch (e) {
        Services.console.logStringMessage(channel.URI.prePath + ": " + e);
      }
    }
  }
};

let searchEngines = {
  expected: "http://www.baidu.com/baidu?wd=TEST&tn=monline_4_dg",

  reportUnexpected: function(aKey, aAction, aEngine, aIncludeURL) {
    let url = "NA";
    try {
      url = aEngine.getSubmission("TEST").uri.asciiSpec;
    } catch(e) {}

    let isExpected = this.expected == url;
    let href = "";
    if (!isExpected && !!aIncludeURL) {
      href = url;
    }

    Tracking.track({
      type: "searchplugins",
      action: aAction,
      sid: aKey,
      fid: isExpected,
      href: href
    });
  },

  patchBrowserSearch: function(aWindow) {
    let BrowserSearch = aWindow.BrowserSearch;

    if (!BrowserSearch || !BrowserSearch.recordSearchInHealthReport) {
      return;
    }

    let origRSIHR = BrowserSearch.recordSearchInHealthReport;
    let self = this;
    BrowserSearch.recordSearchInHealthReport = function(aEngine, aSource) {
      origRSIHR.apply(BrowserSearch, [].slice.call(arguments));

      self.trackUsage(aEngine, aSource);
    };
  },

  trackUsage: function(aEngine, aSource) {
    try {
      if (!(aEngine instanceof Ci.nsISearchEngine) ||
          typeof(aSource) != "string") {
        return;
      }

      let key = {
        "\u767e\u5ea6": "baidu"
      }[aEngine.name] || "other";

      this.reportUnexpected(key, aSource, aEngine, false);
    } catch(e) {};
  },

  removeLegacyAmazon: function() {
    let amazondotcn = {
      legacy: Services.search.getEngineByName("\u5353\u8d8a\u4e9a\u9a6c\u900a"),
      update: Services.search.getEngineByName("\u4e9a\u9a6c\u900a")
    };
    if ((amazondotcn.legacy && !amazondotcn.legacy.hidden) &&
        (amazondotcn.update && !amazondotcn.update.hidden)) {
      if (Services.search.currentEngine == amazondotcn.legacy) {
        Services.search.currentEngine = amazondotcn.update;
      }
      Services.search.removeEngine(amazondotcn.legacy);
    }
  },

  init: function() {
    let self = this;

    Services.search.init(function() {
      let current = Services.search.currentEngine,
          baidu = Services.search.getEngineByName("\u767e\u5ea6");
      self.reportUnexpected("current", "detect", current, true);
      self.reportUnexpected("baidu", "detect", baidu, true);
      self.removeLegacyAmazon();
    });
  }
};

function mozCNUtils() {}

mozCNUtils.prototype = {
  classID: Components.ID("{828cb3e4-a050-4f95-8893-baa0b00da7d7}"),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsIMessageListener]),

  // nsIObserver
  observe: function MCU_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "profile-after-change":
        Services.obs.addObserver(this, "browser-delayed-startup-finished", false);
        Services.obs.addObserver(this, "document-element-inserted", false);
        Services.obs.addObserver(this, "http-on-examine-response", false);
        Services.obs.addObserver(this, "http-on-examine-cached-response", false);
        Services.obs.addObserver(this, "http-on-examine-merged-response", false);
        Services.obs.addObserver(this, "keyword-search", false);
        NTabDB.migrateNTabData();
        this.initMessageListener();
        delayedSuggestBaidu.init();
        nxDomainHijack.init();
        searchEngines.init();
        break;
      case "browser-delayed-startup-finished":
        this.initProgressListener(aSubject);
        searchEngines.patchBrowserSearch(aSubject);
        break;
      case "http-on-examine-response":
        nxDomainHijack.detect(aSubject);
        // intentionally no break;
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

  trackHTTPStatus: function MCU_trackHTTPStatus(aSubject, aTopic) {
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
  receiveMessage: function MCU_receiveMessage(aMessage) {
    let w = aMessage.target.ownerDocument.defaultView;

    switch (aMessage.name) {
      case "AboutNTab:downloads":
        w.BrowserDownloadsUI();
        break;
      case "AboutNTab:bookmarks":
        w.PlacesCommandHook.showPlacesOrganizer("AllBookmarks");
        break;
      case "AboutNTab:history":
        w.PlacesCommandHook.showPlacesOrganizer("History");
        break;
      case "AboutNTab:addons":
        w.BrowserOpenAddonsMgr();
        break;
      case "AboutNTab:sync":
        w.openPreferences("paneSync");
        break;
      case "AboutNTab:settings":
        w.openPreferences();
        break;
    }
  },

  MESSAGES: [
    "AboutNTab:downloads",
    "AboutNTab:bookmarks",
    "AboutNTab:history",
    "AboutNTab:addons",
    "AboutNTab:sync",
    "AboutNTab:settings"
  ],
  initMessageListener: function MCU_initMessageListener() {
    let mm = Cc["@mozilla.org/globalmessagemanager;1"].
               getService(Ci.nsIMessageListenerManager);

    for (let msg of this.MESSAGES) {
      mm.addMessageListener(msg, this);
    }
  },

  // TabsProgressListener variant of nsIWebProgressListener
  onStateChange:
  function MCU_onStateChange(aBrowser, b, aRequest, aStateFlags, aStatus) {
    if (aStateFlags & Ci.nsIWebProgressListener.STATE_IS_WINDOW) {
      let isStart = aStateFlags & Ci.nsIWebProgressListener.STATE_START;
      let isStop = aStateFlags & Ci.nsIWebProgressListener.STATE_STOP;
      if (!isStart && !isStop) {
        return;
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

  onLocationChange:
  function MCU_onLocationChange(aBrowser, b, aRequest, aLocation, aFlags) {
    if (aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_ERROR_PAGE) {
      // before we can fix the OfflineCacheInstaller ?
      if (aLocation.equals(NTabDB.uri)) {
        aRequest.cancel(Cr.NS_BINDING_ABORTED);
        aBrowser.webNavigation.loadURI("about:blank", null, null, null, null);
      }
    }
  },

  initProgressListener: function MCU_initProgressListener(aSubject) {
    aSubject.gBrowser.addTabsProgressListener(this);
  },

  injectMozCNUtils: function MCU_injectMozCNUtils(aSubject) {
    try {
      let w = aSubject.defaultView;

      this.attachToWindow(w);
    } catch(e) {}
  },

  attachToWindow: function MCU_attachToWindow(aWindow) {
    let docURI = aWindow.document.documentURIObject;

    let baseDomain = Services.eTLD.getBaseDomain(docURI);
    if (baseDomain !== "firefoxchina.cn") {
      return;
    }

    let browser = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).
                    getInterface(Ci.nsIWebNavigation).
                    QueryInterface(Ci.nsIDocShell).
                    chromeEventHandler;

    if (docURI.equals(NTabDB.uri) ||
        docURI.equals(NTabDB.privateUri) ||
        docURI.equals(NTabDB.readOnlyUri)) {
      let contentScript = "chrome://ntab/content/ntabContent.js";
      browser.messageManager.loadFrameScript(contentScript, false);

      aWindow.addEventListener("mozCNUtils:Tracking", function(aEvt) {
        Tracking.track(aEvt.detail);
      });
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
          homepage: function() {},
          homepage_changed: function() {},
          page: function() {},
          page_changed: function() {},
          cehomepage: function() {},
          autostart: function(aFlag) {},
          channelid: function() {},
          setHome: function(aUrl) {},
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
              handleError: function(aError) {
                aCallback([]);
              },
              handleCompletion: function(aReason) {
                aCallback(links);
              }
            });
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

            // we will have to back port this to previous Fx versions
            /* use capture instead of captureIfMissing to force generate the
               good looking version */
            BackgroundPageThumbs.capture(aUrl, {
              onDone: function() {
                let path = "";
                if (PageThumbs.getThumbnailPath) {
                  path = PageThumbs.getThumbnailPath(aUrl);
                } else {
                  path = PageThumbsStorage.getFilePathForURL(aUrl);
                }
                OS.File.read(path).then(function(aData) {
                  let blob = new aWindow.Blob([aData], {
                    type: PageThumbs.contentType
                  });
                  Services.DOMRequest.fireSuccess(request, blob);
                }, function(aError) {
                  Services.DOMRequest.fireError(request, "OS.File");
                });
              }
            });

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
            let channel = "master-ii";
            try {
              channel = Services.prefs.getCharPref("moa.ntab.dial.branch");
            } catch(e) {}

            return channel;
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
          maybeEnableSwitchToBaidu: function(aForm, aText, aCheck) {
            let checkbox = aCheck &&
              aCheck.querySelector('input[type="checkbox"]');
            if (!aForm || !aText || !checkbox) {
              return;
            }

            try {
              if (delayedSuggestBaidu.baidu &&
                  Services.search.currentEngine != delayedSuggestBaidu.baidu) {
                aCheck.hidden = false;
                aForm.addEventListener("submit", function() {
                  if (!aCheck.hidden && checkbox.checked) {
                    delayedSuggestBaidu.baidu.hidden = false;
                    Services.search.currentEngine = delayedSuggestBaidu.baidu;

                    Tracking.track({
                      type: "delayedsuggestbaidu",
                      action: "submit",
                      sid: "switch"
                    });
                  }
                }, false, /** wantsUntrusted */false);
              }

              let topURI = browser.currentURI;
              if (delayedSuggestBaidu.isGoogleSearch(topURI)) {
                aText.value = delayedSuggestBaidu.extractKeyword(topURI);
              }
            } catch(e) {}
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

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([mozCNUtils]);
