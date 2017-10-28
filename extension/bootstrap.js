/* globals APP_STARTUP */

const {
  classes: Cc, interfaces: Ci, manager: Cm,
  results: Cr, utils: Cu
} = Components;

Cu.importGlobalProperties(["Blob"]);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "WebChannel",
  "resource://gre/modules/WebChannel.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "setTimeout",
  "resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "clearTimeout",
  "resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PageThumbs",
  "resource://gre/modules/PageThumbs.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS",
  "resource://gre/modules/osfile.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "fxAccounts",
  "resource://gre/modules/FxAccounts.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "CustomizableUI",
  "resource:///modules/CustomizableUI.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "BackgroundPageThumbs",
  "resource://gre/modules/BackgroundPageThumbs.jsm");

XPCOMUtils.defineLazyGetter(this, "gMM", () => {
  return Cc["@mozilla.org/globalmessagemanager;1"].
    getService(Ci.nsIMessageListenerManager);
});

XPCOMUtils.defineLazyModuleGetter(this, "delayedSuggestBaidu",
  "resource://ntab/mozCNUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Frequent",
  "resource://ntab/mozCNUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Homepage",
  "resource://ntab/mozCNUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Session",
  "resource://ntab/mozCNUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "getPref",
  "resource://ntab/mozCNUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NTabDB",
  "resource://ntab/NTabDB.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NTabSync",
  "resource://ntab/NTabSync.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NTabWindow",
  "resource://ntab/NTabWindow.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PartnerBookmarks",
  "resource://ntab/PartnerBookmarks.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "QuickDialData",
  "resource://ntab/QuickDialData.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Tracking",
  "resource://ntab/Tracking.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "AboutCEhome",
  "resource://ntab/AboutCEhome.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "CehpUpdateParams",
  "resource://ntab/CehpUpdateParams.jsm");

this.searchEngines = {
  expected: /^https?:\/\/www\.baidu\.com\/baidu\?wd=TEST&tn=monline(?:_|_4_)dg(?:&ie=utf-8)?$/,

  reportUnexpected(aKey, aAction, aEngine, aIncludeURL) {
    let url = "NA";
    try {
      url = aEngine.getSubmission("TEST").uri.asciiSpec;
    } catch (e) {}

    let isExpected = this.expected.test(url);
    let href = "";
    if (!isExpected && !!aIncludeURL) {
      href = url;
    }

    Tracking.track({
      type: "searchplugins",
      action: aAction,
      sid: aKey,
      fid: isExpected,
      href
    });
  },

  init() {
    Services.search.init(() => {
      let current = Services.search.currentEngine,
          baidu = Services.search.getEngineByName("\u767e\u5ea6");
      this.reportUnexpected("current", "detect", current, true);
      this.reportUnexpected("baidu", "detect", baidu, true);
    });
  }
};

this.fxAccountsProxy = {
  messageName: "mozCNUtils:FxAccounts",
  mutationConfig: {
    attributes: true,
    attributeFilter: [
      "disabled",
      "failed",
      "fxastatus",
      "hidden",
      "label",
      "signedin",
      "status",
      "tooltiptext"
    ]
  },
  observers: new WeakMap(),
  getFxaOrSync(aWindow) {
    if (!aWindow || !aWindow.gSync) {
      return null;
    }

    return {
      container: aWindow.gSync.appMenuContainer,
      label: aWindow.gSync.appMenuLabel,
      status: aWindow.gSync.appMenuStatus
    };
  },
  generateKVs(fxaOrSync) {
    let kvs = {};

    if (fxaOrSync.container &&
        fxaOrSync.label &&
        fxaOrSync.status) {
      ["disabled", "fxastatus"].forEach(aKey => {
        if (fxaOrSync.container.hasAttribute(aKey)) {
          kvs[aKey] = fxaOrSync.container.getAttribute(aKey);
        }
      });
      ["label"].forEach(aKey => {
        if (fxaOrSync.label.hasAttribute(aKey)) {
          kvs[aKey] = fxaOrSync.label.getAttribute(aKey);
        }
      });
      ["tooltiptext"].forEach(aKey => {
        if (fxaOrSync.status.hasAttribute(aKey)) {
          kvs[aKey] = fxaOrSync.status.getAttribute(aKey);
        }
      });
    }

    return kvs;
  },
  maybeRegisterMutationObserver(aWindow) {
    let fxaOrSync = this.getFxaOrSync(aWindow);
    let windowMM = aWindow.messageManager;
    if (!fxaOrSync || !windowMM) {
      return;
    }

    let config = this.mutationConfig;
    let observer = new aWindow.MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type != "attributes" ||
            config.attributeFilter.indexOf(mutation.attributeName) < 0) {
          return;
        }

        let kvs = this.generateKVs(fxaOrSync);
        windowMM.broadcastAsyncMessage(this.messageName, "mutation", kvs);
      });
    });

    this.observers.set(aWindow, observer);

    if (fxaOrSync.container &&
        fxaOrSync.label &&
        fxaOrSync.status) {
      observer.observe(fxaOrSync.container, config);
      observer.observe(fxaOrSync.label, config);
      observer.observe(fxaOrSync.status, config);
    }
  },
  maybeInitContentButton(aBrowser) {
    let fxaOrSync = this.getFxaOrSync(aBrowser.ownerGlobal);
    let browserMM = aBrowser.messageManager;
    if (!fxaOrSync || !browserMM) {
      return;
    }

    let kvs = this.generateKVs(fxaOrSync);
    browserMM.sendAsyncMessage(this.messageName, "init", kvs);
  },
  maybeUnregisterMutationObserver(aWindow) {
    let observer = this.observers.get(aWindow);
    if (!observer) {
      return;
    }

    observer.disconnect();
    this.observers.delete(aWindow);
  },
  init() {
    gMM.addMessageListener(this.messageName, this);
  },
  uninit() {
    gMM.removeMessageListener(this.messageName, this);
  },
  // nsIMessageListener
  receiveMessage(aMessage) {
    let browser = aMessage.target;
    if (aMessage.name !== this.messageName ||
        !browser.currentURI.equals(NTabDB.uri)) {
      return;
    }

    switch (aMessage.data) {
      case "init":
        this.maybeInitContentButton(browser);
        break;
      case "action":
        let fxaOrSync = (browser.ownerGlobal.gSync ||
                         browser.ownerGlobal.gFxAccounts);
        fxaOrSync.onMenuPanelCommand(aMessage.objects);
        Tracking.track({
          type: "ntabsync",
          action: "click",
          sid: "in-content"
        });
        break;
    }
  },
};

this.mozCNUtils = {
  factories: new Map(),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsIMessageListener]),

  // nsIObserver
  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "http-on-examine-response":
      case "http-on-examine-cached-response":
      case "http-on-examine-merged-response":
        this.trackHTTPStatus(aSubject, aTopic);
        break;
      case "places-browser-init-complete":
        PartnerBookmarks.init();
        break;
    }
  },

  frameScripts: [
    "chrome://ceerrorpage/content/ceerrorpage.js",
    "chrome://ntab/content/ntabContent.js"
  ],
  initFrameScripts() {
    this.frameScripts.forEach(frameScript => {
      gMM.loadFrameScript(frameScript, true);
    });
  },
  uninitFrameScripts() {
    this.frameScripts.forEach(frameScript => {
      gMM.removeDelayedFrameScript(frameScript);
    });
  },

  trackHTTPStatus(aSubject, aTopic) {
    let channel = aSubject;
    channel.QueryInterface(Ci.nsIHttpChannel);

    if ([
      NTabDB.prePath,
      "http://i.g-fox.cn",
      "http://e.firefoxchina.cn",
      "http://home.firefoxchina.cn",
      "http://i.firefoxchina.cn",
      "http://n.firefoxchina.cn"
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
  receiveMessage(aMessage) {
    if (this.MESSAGES.indexOf(aMessage.name) < 0) {
      return;
    }

    switch (aMessage.name) {
      case "mozCNUtils:Tracking":
        Tracking.track(aMessage.data);
        break;
      case "mozCNUtils:WebChannel":
        switch ((aMessage.data && aMessage.data.type)) {
          case "isBaiduCurrentSearch":
            let topURI = aMessage.target.currentURI;
            aMessage.target.messageManager.sendAsyncMessage(aMessage.name, {
              type: aMessage.data.type,
              data: {
                exists: !!delayedSuggestBaidu.baidu,
                isCurrent: (delayedSuggestBaidu.baidu &&
                            (Services.search.currentEngine ===
                             delayedSuggestBaidu.baidu)),
                searchText: (delayedSuggestBaidu.isGoogleSearch(topURI) ?
                             delayedSuggestBaidu.extractKeyword(topURI) :
                             topURI.spec)
              }
            });
            break;
          case "isFxDefaultBrowser":
            // a response should be sent even shellService not available
            aMessage.target.messageManager.sendAsyncMessage(aMessage.name, {
              type: aMessage.data.type,
              data: (this.shellService &&
                     this.shellService.isDefaultBrowser(false, false))
            });
            break;
          case "setBaiduAsCurrentSearch":
            delayedSuggestBaidu.baidu.hidden = false;
            Services.search.currentEngine = delayedSuggestBaidu.baidu;

            Tracking.track({
              type: "delayedsuggestbaidu",
              action: "submit",
              sid: "switch"
            });
            break;
          case "setFxAsDefaultBrowser":
            if (!this.shellService) {
              break;
            }
            this.shellService.setDefaultBrowser(false, false);
            break;
        }
        break;
    }
  },

  get shellService() {
    let shellService;
    try {
      shellService = Cc["@mozilla.org/browser/shell-service;1"].
        getService(Ci.nsIShellService);
    } catch (e) {
      // shellService is not universally available, see https://bugzil.la/297841
    }
    delete this.shellService;
    return this.shellService = shellService;
  },

  MESSAGES: [
    "mozCNUtils:Tracking",
    "mozCNUtils:WebChannel"
  ],
  initMessageListener() {
    for (let msg of this.MESSAGES) {
      gMM.addMessageListener(msg, this);
    }
  },
  uninitMessageListener() {
    for (let msg of this.MESSAGES) {
      gMM.removeMessageListener(msg, this);
    }
  },

  // TabsProgressListener variant of nsIWebProgressListener
  onStateChange(aBrowser, aWebProgress, aRequest, aStateFlags, aStatus) {
    if (aWebProgress.isTopLevel &&
        (aStateFlags & Ci.nsIWebProgressListener.STATE_IS_WINDOW)) {
      let isStart = aStateFlags & Ci.nsIWebProgressListener.STATE_START;
      let isStop = aStateFlags & Ci.nsIWebProgressListener.STATE_STOP;
      if (!isStart && !isStop) {
        return;
      }

      if (delayedSuggestBaidu.isGoogleSearch(aRequest.URI)) {
        if (isStart) {
          delayedSuggestBaidu.attach(aBrowser, aRequest.URI);
        }
        if (isStop) {
          delayedSuggestBaidu.remove(aBrowser, aStatus);
        }
      }
    }
  },

  onLocationChange(aBrowser, b, aRequest, aLocation, aFlags) {
    if (aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_ERROR_PAGE) {
      // before we can fix the OfflineCacheInstaller ?
      if (aLocation.equals(NTabDB.uri)) {
        aRequest.cancel(Cr.NS_BINDING_ABORTED);
        aBrowser.webNavigation.loadURI("about:blank", null, null, null, null);
      }
    }
  },

  initDefaultPrefs() {
    let defBranch = Services.prefs.getDefaultBranch("");

    defBranch.setCharPref("moa.signatureverifier.key",
      "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDbjn89QtfQeDfU1KDdHsy7dWEZxixJSvaAOGX05NOvLbh7Uo6tlMKFJyYZ7unxlfMAsewZBOCaMxEYgU4h5J0PAgUs+zTg3MzCnDA0Ku1zQrvoa1iaTsVxzpHTFeOK29HSGX2qC4sVUP+ZRqa11oaBaIjpuJ3szo9nGy4CWvHMLQIDAQAB");

    defBranch.setBoolPref("moa.ntab.openInNewTab", true);
    defBranch.setBoolPref("services.sync.engine.mozcn.ntab", false);
  },

  initFactories() {
    Cm.QueryInterface(Ci.nsIComponentRegistrar);

    [AboutCEhome, CehpUpdateParams].forEach(targetConstructor => {
      let proto = targetConstructor.prototype;
      let factory = XPCOMUtils._getFactory(targetConstructor);
      this.factories.set(proto.classID, factory);
      Cm.registerFactory(proto.classID, proto.classDescription,
                         proto.contractID, factory);

      for (let xpcom_category of (proto._xpcom_categories || [])) {
        XPCOMUtils.categoryManager.addCategoryEntry(xpcom_category.category,
          (xpcom_category.entry || proto.classDescription),
          (xpcom_category.value || proto.contractID),
          false, true);
      }
    });
  },

  uninitFactories() {
    for (let [classID, factory] of this.factories) {
      Cm.unregisterFactory(classID, factory);
    }
    this.factories = new Map();
  },

  initWindowListener() {
    for (let win of CustomizableUI.windows) {
      this.onWindowOpened(win);
    }

    CustomizableUI.addListener(this);
  },

  uninitWindowListener() {
    CustomizableUI.removeListener(this);

    for (let win of CustomizableUI.windows) {
      this.onWindowClosed(win);
    }
  },

  onWindowOpened(win) {
    win.gBrowser.addTabsProgressListener(this);
    fxAccountsProxy.maybeRegisterMutationObserver(win);
    NTabWindow.onWindowOpened(win);
  },

  onWindowClosed(win) {
    win.gBrowser.removeTabsProgressListener(this);
    fxAccountsProxy.maybeUnregisterMutationObserver(win);
    NTabWindow.onWindowClosed(win);
  },

  init(isAppStartup) {
    Services.obs.addObserver(this, "http-on-examine-response");
    Services.obs.addObserver(this, "http-on-examine-cached-response");
    Services.obs.addObserver(this, "http-on-examine-merged-response");
    Services.obs.addObserver(this, "places-browser-init-complete");

    this.initDefaultPrefs();
    this.initFactories();
    this.initFrameScripts();
    this.initMessageListener();
    this.initWindowListener();

    delayedSuggestBaidu.init();
    fxAccountsProxy.init();
    Homepage.init(isAppStartup);
    mozCNWebChannels.init();
    NTabDB.init();
    NTabSync.init();
    NTabWindow.init();
    searchEngines.init();
  },

  uninit() {
    Services.obs.removeObserver(this, "http-on-examine-response");
    Services.obs.removeObserver(this, "http-on-examine-cached-response");
    Services.obs.removeObserver(this, "http-on-examine-merged-response");
    Services.obs.removeObserver(this, "places-browser-init-complete");

    this.uninitFactories();
    this.uninitFrameScripts();
    this.uninitMessageListener();
    this.uninitWindowListener();

    fxAccountsProxy.uninit();
    mozCNWebChannels.uninit();
    NTabDB.uninit();
    NTabSync.uninit();
    NTabWindow.uninit();
  }
};

this.mozCNWebChannel = function(aChannelID, aURI, aListener) {
  this.channel = new WebChannel(aChannelID, aURI);
  this.channel.listen((this[aListener] || this.baseListener).bind(this));
};
this.mozCNWebChannel.prototype = {
  baseListener(a, aMessage, aSender) {
    switch (aMessage.key) {
      case "frequent.query":
        Frequent.query(aEntries => {
          this.channel.send({
            id: aMessage.id,
            key: aMessage.key,
            data: aEntries
          }, aSender);
        }, aMessage.parameters.limit);
        break;
      case "frequent.remove":
        Frequent.remove([aMessage.parameters.url]);
        break;
      case "frequent.tophosts":
        Frequent.topHosts(aEntries => {
          this.channel.send({
            id: aMessage.id,
            key: aMessage.key,
            data: aEntries
          }, aSender);
        }, aMessage.parameters.hosts);
        break;
      case "last.query":
        Session.query(aEntries => {
          this.channel.send({
            id: aMessage.id,
            key: aMessage.key,
            data: aEntries
          }, aSender);
        }, aMessage.parameters.limit);
        break;
      case "last.remove":
        Session.remove([aMessage.parameters.url]);
        break;
      case "startup.channelid":
        this.channel.send({
          id: aMessage.id,
          key: aMessage.key,
          data: getPref("app.chinaedition.channel", "www.firefox.com.cn")
        }, aSender);
        break;
    }
  },
  offlintabListener(a, aMessage, aSender) {
    this.baseListener.apply(this, arguments);

    let self = this;
    switch (aMessage.key) {
      case "bookmark.query":
        let db = Cc["@mozilla.org/browser/nav-history-service;1"].
                   getService(Ci.nsINavHistoryService).
                   QueryInterface(Ci.nsPIPlacesDatabase).
                   DBConnection;
        let sql = ("SELECT b.title as title, p.url as url " +
                   "FROM moz_bookmarks b, moz_places p " +
                   "WHERE b.type = 1 AND b.fk = p.id AND p.hidden = 0");
        let statement = db.createAsyncStatement(sql);
        let links = [];
        db.executeAsync([statement], 1, {
          handleResult(aResultSet) {
            let row = aResultSet.getNextRow();

            for (; row; row = aResultSet.getNextRow()) {
              links.push({
                title: row.getResultByName("title"),
                url: row.getResultByName("url")
              });
            }
          },
          handleError(aError) {
            self.channel.send({
              id: aMessage.id,
              key: aMessage.key,
              data: []
            }, aSender);
          },
          handleCompletion(aReason) {
            self.channel.send({
              id: aMessage.id,
              key: aMessage.key,
              data: links
            }, aSender);
          }
        });
        break;
      case "thumbs.getThumbnail":
        /**
         * use capture instead of captureIfMissing to force generate the
         * better looking version.
         */
        let url = aMessage.parameters.url;
        BackgroundPageThumbs.capture(url, {
          onDone() {
            let path = PageThumbs.getThumbnailPath(url);
            OS.File.read(path).then(aData => {
              let blob = new Blob([aData], {
                type: PageThumbs.contentType
              });
              self.channel.send({
                id: aMessage.id,
                key: aMessage.key,
                data: {
                  url,
                  blob
                }
              }, aSender);
            }, aError => {
              self.channel.send({
                id: aMessage.id,
                key: aMessage.key,
                data: {
                  url
                }
              }, aSender);
            });
          }
        });
        break;
      case "variant.channel":
        this.channel.send({
          id: aMessage.id,
          key: aMessage.key,
          data: QuickDialData.variant
        }, aSender);
        break;
    }
  }
};

this.mozCNWebChannels = {
  channelID: "moz_cn_channel_v2",
  contentURL: "chrome://ntab/content/mozCNWebChannelContent.js",
  specs: {
    "http://e.firefoxchina.cn/": "",
    "http://home.firefoxchina.cn/": "",
    "http://i.firefoxchina.cn/": "",
    "http://n.firefoxchina.cn/": "",
    "http://newtab.firefoxchina.cn/": "",
    "http://offlintab.firefoxchina.cn/": "offlintabListener"
  },
  webChannels: [],
  init() {
    Object.keys(this.specs).forEach(aSpec => {
      let uri = Services.io.newURI(aSpec);
      let webChan = new mozCNWebChannel(this.channelID, uri, this.specs[aSpec]);
      this.webChannels.push(webChan);
    });
    gMM.loadFrameScript(this.contentURL, true);
  },
  uninit() {
    while (this.webChannels.length) {
      let webChan = this.webChannels.shift();
      webChan.channel.stopListening();
    }
    gMM.removeDelayedFrameScript(this.contentURL);
  }
};

function install() {}
async function startup({ webExtension }, reason) {
  mozCNUtils.init(reason === APP_STARTUP);

  /* let { browser } = */await webExtension.startup();
}
function shutdown() {
  mozCNUtils.uninit();
}
function uninstall() {}
