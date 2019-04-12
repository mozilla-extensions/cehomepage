this.EXPORTED_SYMBOLS = ["mozCNUtils"];

const { manager: Cm } = Components;

Cu.importGlobalProperties(["Blob"]);

ChromeUtils.defineModuleGetter(this, "XPCOMUtils",
  "resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetters(this, {
  "AddonManager": "resource://gre/modules/AddonManager.jsm", /* global AddonManager */
  "BackgroundPageThumbs": "resource://gre/modules/BackgroundPageThumbs.jsm", /* global BackgroundPageThumbs */
  "clearTimeout": "resource://gre/modules/Timer.jsm", /* global clearTimeout */
  "CustomizableUI": "resource:///modules/CustomizableUI.jsm", /* global CustomizableUI */
  "OS": "resource://gre/modules/osfile.jsm", /* global OS */
  "PageThumbs": "resource://gre/modules/PageThumbs.jsm", /* global PageThumbs */
  "PlacesUtils": "resource://gre/modules/PlacesUtils.jsm", /* global PlacesUtils */
  "Services": "resource://gre/modules/Services.jsm", /* global Services */
  "setTimeout": "resource://gre/modules/Timer.jsm", /* global setTimeout */
  "WebChannel": "resource://gre/modules/WebChannel.jsm" /* global WebChannel */
});

XPCOMUtils.defineLazyGetter(this, "gMM", () => {
  return Cc["@mozilla.org/globalmessagemanager;1"].
    getService(Ci.nsIMessageListenerManager || Ci.nsISupports);
});
XPCOMUtils.defineLazyGetter(this, "generateQI", () => {
  // ChromeUtils one introduced in Fx 61, mandatory in https://bugzil.la/1484466
  return XPCOMUtils.generateQI ?
    XPCOMUtils.generateQI.bind(XPCOMUtils) :
    ChromeUtils.generateQI.bind(ChromeUtils);
});


XPCOMUtils.defineLazyModuleGetters(this, {
  "AboutCEhome": "resource://ntab/AboutCEhome.jsm", /* global AboutCEhome */
  "delayedSuggestBaidu": "resource://ntab/mozCNUtils.jsm", /* global delayedSuggestBaidu */
  "Frequent": "resource://ntab/mozCNUtils.jsm", /* global Frequent */
  "getPref": "resource://ntab/mozCNUtils.jsm", /* global getPref */
  "Homepage": "resource://ntab/mozCNUtils.jsm", /* global Homepage */
  "NTabDB": "resource://ntab/NTabDB.jsm", /* global NTabDB */
  "NTabWindow": "resource://ntab/NTabWindow.jsm", /* global NTabWindow */
  "QuickDialData": "resource://ntab/QuickDialData.jsm", /* global QuickDialData */
  "Session": "resource://ntab/mozCNUtils.jsm", /* global Session */
  "Tracking": "resource://ntab/Tracking.jsm" /* global Tracking */
});

this.strings = {
  _ctx: null,

  init(context) {
    this._ctx = context;
  },

  uninit() {
    delete this._ctx;
  },

  _(name, subs) {
    if (!this._ctx) {
      return "";
    }

    let cloneScope = this._ctx.cloneScope;
    return this._ctx.extension.localizeMessage(name, subs, {cloneScope});
  }
};

this.searchEngines = {
  expected: /^https?:\/\/www\.baidu\.com\/baidu\?wd=TEST&tn=monline(?:_|_4_|_7_)dg(?:&ie=utf-8)?$/,

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
    let detect = () => {
      // See https://bugzil.la/1237648,1493483
      let current = Services.search.defaultEngine,
          baidu = Services.search.getEngineByName("\u767e\u5ea6");
      this.reportUnexpected("current", "detect", current, true);
      this.reportUnexpected("baidu", "detect", baidu, true);
    };

    // Since Fx 67, see https://bugzil.la/1524593
    if (Ci.nsISearchService) {
      Services.search.init().then(detect);
    } else {
      Services.search.init(detect);
    }
  }
};

this.morePermissionPromptHack = {
  extensionId: "",
  prefKey: "extensions.chinaEditionHomepage.pendingNextVersion",
  topic: "webextension-update-permissions",

  get nextVersion() {
    return Services.prefs.getCharPref(this.prefKey, "0");
  },
  set nextVersion(version) {
    if (version) {
      Services.prefs.setCharPref(this.prefKey, version);
    } else {
      Services.prefs.clearUserPref(this.prefKey);
    }
  },

  async init({extension}) {
    this.extensionId = extension.id;
    Services.obs.addObserver(this, this.topic);

    if (this.nextVersion &&
        Services.vc.compare(extension.version, this.nextVersion) >= 0) {
      this.nextVersion = null;
      return;
    }

    let addon = await AddonManager.getAddonByID(this.extensionId);
    addon.findUpdates({
      onUpdateAvailable(addon, install) {
        if (addon.permissions & AddonManager.PERM_CAN_UPGRADE &&
            AddonManager.shouldAutoUpdate(addon)) {
          // Trigger the installation w/o the permission prompt
          install.install();
        }
      },
    }, AddonManager.UPDATE_WHEN_PERIODIC_UPDATE);
  },

  observe(subject, topic, data) {
    if (topic !== this.topic) {
      return;
    }

    let { addon, type } = subject.wrappedJSObject;
    if (addon.id !== this.extensionId || type !== "update") {
      return;
    }

    this.nextVersion = addon.version;
  },

  uninit(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }

    Services.obs.removeObserver(this, this.topic);
  }
};

this.mozCNUtils = {
  factories: new Map(),

  QueryInterface: generateQI([Ci.nsIObserver,
                              Ci.nsIMessageListener]),

  // nsIObserver
  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "http-on-examine-response":
      case "http-on-examine-cached-response":
      case "http-on-examine-merged-response":
        this.trackHTTPStatus(aSubject, aTopic);
        break;
    }
  },

  frameScripts: [
    "resource://ntab/ntabContent.js"
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

    if (![
      NTabDB.prePath,
      "http://i.g-fox.cn",
      "https://home.firefoxchina.cn"
    ].includes(channel.URI.prePath) ||
        !(channel.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI)) {
      return;
    }

    if (![200, 302, 304].includes(channel.responseStatus)) {
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
    if (!this.MESSAGES.includes(aMessage.name)) {
      return;
    }

    switch (aMessage.name) {
      case "mozCNUtils:Tracking":
        Tracking.track(aMessage.data);
        break;
      case "mozCNUtils:WebChannel":
        switch ((aMessage.data && aMessage.data.type)) {
          case "isFxDefaultBrowser":
            // a response should be sent even shellService not available
            aMessage.target.messageManager.sendAsyncMessage(aMessage.name, {
              type: aMessage.data.type,
              data: (this.shellService &&
                     this.shellService.isDefaultBrowser(false, false))
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

    defBranch.setBoolPref("moa.ntab.openInNewTab", true);
    defBranch.setBoolPref("services.sync.engine.mozcn.ntab", false);
  },

  initFactories() {
    Cm.QueryInterface(Ci.nsIComponentRegistrar);

    [AboutCEhome].forEach(targetConstructor => {
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
    if (win.gBrowser) {
      win.gBrowser.addTabsProgressListener(this);
    } else if (win._gBrowser) {
      win._gBrowser.addTabsProgressListener(this);
    } else {
      win.console.error("Neither gBrowser or _gBrowser ?");
    }
    NTabWindow.onWindowOpened(win);
  },

  onWindowClosed(win) {
    win.gBrowser.removeTabsProgressListener(this);
    NTabWindow.onWindowClosed(win);
  },

  init(context) {
    morePermissionPromptHack.init(context);
    let isAppStartup = context.extension.startupReason === "APP_STARTUP";
    strings.init(context);

    Services.obs.addObserver(this, "http-on-examine-response");
    Services.obs.addObserver(this, "http-on-examine-cached-response");
    Services.obs.addObserver(this, "http-on-examine-merged-response");

    this.initDefaultPrefs();
    this.initFactories();
    this.initFrameScripts();
    this.initMessageListener();

    delayedSuggestBaidu.init(strings);
    Homepage.init(isAppStartup);
    mozCNWebChannels.init();
    NTabDB.init();
    NTabWindow.init(strings);
    searchEngines.init();

    // this needs to run after NTabWindow.init for strings
    this.initWindowListener();
  },

  uninit(isAppShutdown) {
    Services.obs.removeObserver(this, "http-on-examine-response");
    Services.obs.removeObserver(this, "http-on-examine-cached-response");
    Services.obs.removeObserver(this, "http-on-examine-merged-response");

    this.uninitFactories();
    this.uninitFrameScripts();
    this.uninitMessageListener();
    this.uninitWindowListener();

    Homepage.uninit(isAppShutdown);
    mozCNWebChannels.uninit();
    morePermissionPromptHack.uninit(isAppShutdown);
    NTabDB.uninit();
    NTabWindow.uninit();

    for (let jsModule of [
      "AboutCEhome",
      "mozCNUtils",
      "NTabDB",
      "NTabWindow",
      "QuickDialData",
      "Tracking",
    ]) {
      try {
        Cu.unload(`resource://ntab/${jsModule}.jsm`);
      } catch (ex) {
        Cu.reportError(ex);
      }
    }
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
        Frequent.remove(() => {
          this.channel.send({
            id: aMessage.id,
            key: aMessage.key
          }, aSender);
        }, [aMessage.parameters.url]);
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
        Session.remove(() => {
          this.channel.send({
            id: aMessage.id,
            key: aMessage.key
          }, aSender);
        }, [aMessage.parameters.url]);
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
        let db = PlacesUtils.history.DBConnection;
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
  contentURL: "resource://ntab/mozCNWebChannelContent.js",
  specs: {
    "https://home.firefoxchina.cn/": "",
    "http://newtab.firefoxchina.cn/": "",
    "https://newtab.firefoxchina.cn/": "",
    "http://offlintab.firefoxchina.cn/": "offlintabListener",
    "https://offlintab.firefoxchina.cn/": "offlintabListener"
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
