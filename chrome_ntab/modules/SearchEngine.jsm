const EXPORTED_SYMBOLS = [
  'delayedSuggestBaidu',
  'searchEngines'
];

const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');

XPCOMUtils.defineLazyModuleGetter(this, 'Services',
  'resource://gre/modules/Services.jsm');
XPCOMUtils.defineLazyModuleGetter(this, "setTimeout",
  "resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "clearTimeout",
  "resource://gre/modules/Timer.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Tracking",
  "resource://ntab/Tracking.jsm");

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

  isBaidu: function() {
    return delayedSuggestBaidu.baidu &&
      Services.search.currentEngine == delayedSuggestBaidu.baidu;
  },

  switchToBaidu: function() {
    delayedSuggestBaidu.baidu.hidden = false;
    Services.search.currentEngine = delayedSuggestBaidu.baidu;
    Tracking.track({
      type: "delayedsuggestbaidu",
      action: "submit",
      sid: "switch"
    });
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
