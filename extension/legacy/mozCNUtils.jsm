/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global globalThis */

this.EXPORTED_SYMBOLS = [
  "delayedSuggestBaidu", "Frequent", "getPref", "Homepage", "Session",
];

ChromeUtils.defineModuleGetter(this, "XPCOMUtils",
  "resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetters(this, {
  clearTimeout: "resource://gre/modules/Timer.jsm",
  PlacesUtils: "resource://gre/modules/PlacesUtils.jsm",
  Preferences: "resource://gre/modules/Preferences.jsm",
  setTimeout: "resource://gre/modules/Timer.jsm",
  Tracking: "resource://ntab/Tracking.jsm",
});
// Since Fx 104, see https://bugzil.la/1667455,1780695
const Services =
  globalThis.Services ||
  ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

var delayedSuggestBaidu = {
  attribute: "mozCNDelayedSuggestBaidu",
  delay: 10e3,
  icon: "resource://ntab/skin/delayed-suggest-baidu.png",
  knownStatus: [Cr.NS_ERROR_NET_RESET, Cr.NS_ERROR_NET_TIMEOUT],
  notificationKey: "mozcn-delayed-suggest-baidu",
  prefKey: "moa.delayedsuggest.baidu",
  version: 1, // bump this to ignore existing nomore

  get baidu() {
    delete this.baidu;
    return this.baidu = Services.search.getEngineByName("\u767e\u5ea6");
  },

  get enabled() {
    return (getPref(this.prefKey, 0) < this.version) && this.baidu;
  },

  init(strings) {
    this._strings = strings;
    Services.search.init();
  },

  isGoogleSearch(aURI) {
    try {
      let publicSuffix = Services.eTLD.getPublicSuffix(aURI);
      let hostMatch = ["google.", "www.google."].some(aPrefix => {
        return (aPrefix + publicSuffix) == aURI.asciiHost;
      });

      if (!hostMatch) {
        return false;
      }
    } catch (e) {
      return false;
    }

    return (aURI.pathQueryRef == "/" ||
            aURI.pathQueryRef.startsWith("/search?"));
  },

  attach(aBrowser, aURI) {
    this.remove(aBrowser);
    if (!this.enabled) {
      return;
    }

    let timeoutId = setTimeout(() => {
      this.notify(aBrowser, aURI);
    }, this.delay);
    aBrowser.setAttribute(this.attribute, timeoutId);
  },

  remove(aBrowser, aStatus = Cr.NS_OK) {
    if (aBrowser.hasAttribute(this.attribute)) {
      let timeoutId = aBrowser.getAttribute(this.attribute);
      aBrowser.removeAttribute(this.attribute);
      clearTimeout(parseInt(timeoutId, 10));
    }

    if (!this.knownStatus.includes(aStatus)) {
      let gBrowser = aBrowser.ownerGlobal.gBrowser;
      let notificationBox = gBrowser.getNotificationBox(aBrowser);
      let notification = notificationBox.
        getNotificationWithValue(this.notificationKey);
      if (notification) {
        notificationBox.removeNotification(notification);
      }
    }
  },

  extractKeyword(aURI) {
    let keyword = "";

    try {
      let query = aURI.QueryInterface(Ci.nsIURL).query;

      if (query) {
        query.split("&").some(aChunk => {
          let pair = aChunk.split("=");

          let match = pair[0] == "q";
          if (match) {
            keyword = decodeURIComponent(pair[1]).replace(/\+/g, " ");
          }
          return match;
        });
      }
    } catch (e) {}

    return keyword;
  },

  notify(aBrowser, aURI) {
    if (!this.enabled) {
      return;
    }

    let keyword = this.extractKeyword(aURI);

    let gBrowser = aBrowser.ownerGlobal.gBrowser;
    let notificationBox = gBrowser.getNotificationBox(aBrowser);

    let self = this;
    let prefix = "delayedSuggestBaidu.notification.";
    let message = this._strings._(prefix + "message");
    let positive = this._strings._(prefix + "positive");
    let negative = this._strings._(prefix + "negative");

    let buttons = [{
      label: positive,
      accessKey: "Y",
      callback() {
        self.searchAndSwitchEngine(aBrowser, keyword);
      },
    }, {
      label: negative,
      accessKey: "N",
      callback() {
        self.markNomore();
      },
    }];
    let image = this.icon;

    // Since Fx 94, see https://bugzil.la/1690390
    let notificationBar = notificationBox.isShown !== undefined ?
      notificationBox.appendNotification(
        this.notificationKey,
        {
          label: message,
          image,
          priority: notificationBox.PRIORITY_INFO_HIGH,
        },
        buttons
      ) : notificationBox.appendNotification(
        message,
        this.notificationKey,
        image,
        notificationBox.PRIORITY_INFO_HIGH,
        buttons
      );
    notificationBar.persistence = 1;
    Tracking.track({
      type: "delayedsuggestbaidu",
      action: "notify",
      sid: "dummy",
    });
  },

  searchAndSwitchEngine(aBrowser, aKeyword) {
    let w = aBrowser.ownerGlobal;
    if (aKeyword) {
      let submission = this.baidu.getSubmission(aKeyword);
      // always replace in the current tab
      (w.openWebLinkIn || w.openUILinkIn)(submission.uri.spec, "current", null, submission.postData);
    } else {
      (w.openWebLinkIn || w.openUILinkIn)(this.baidu.searchForm, "current");
    }

    if (Services.search.defaultEngine.name == "Google") {
      this.baidu.hidden = false;
      Services.search.defaultEngine = this.baidu;

      Tracking.track({
        type: "delayedsuggestbaidu",
        action: "click",
        sid: "switch",
      });
    }

    Tracking.track({
      type: "delayedsuggestbaidu",
      action: "click",
      sid: "search",
    });
  },

  markNomore() {
    try {
      Services.prefs.setIntPref(this.prefKey, this.version);
    } catch (e) {}

    Tracking.track({
      type: "delayedsuggestbaidu",
      action: "click",
      sid: "nomore",
    });
  },
};

var Frequent = {
  excludes: [
    /^https?:\/\/[a-z]+.firefoxchina.cn\/n(ew)?tab/,
    /^https?:\/\/[a-z]+.firefoxchina.cn\/parts\/google_rdr/,
    /^https?:\/\/[a-z]+.firefoxchina.cn\/redirect\/adblock/,
    /^https?:\/\/[a-z]+.firefoxchina.cn\/(redirect\/)?search/,
    /^http:\/\/i.g-fox.cn\/(rd|search)/,
    /^http:\/\/www5.1616.net\/q/,
  ],
  needsDeduplication: false,
  order: Ci.nsINavHistoryQueryOptions.SORT_BY_FRECENCY_DESCENDING,

  query(aCallback, aLimit) {
    let options = PlacesUtils.history.getNewQueryOptions();
    options.maxResults = aLimit + 16;
    options.sortingMode = this.order;

    let deduplication = {};
    let links = [];
    let self = this;

    let callback = {
      handleResult(aResultSet) {
        let row = aResultSet.getNextRow();

        for (; row; row = aResultSet.getNextRow()) {
          if (links.length >= aLimit) {
            break;
          }
          let url = row.getResultByIndex(1);
          let title = row.getResultByIndex(2);

          if (self.needsDeduplication) {
            if (deduplication[title]) {
              continue;
            }
            deduplication[title] = 1;
          }

          if (!self.excludes.some(aExclude => {
            return aExclude.test(url);
          })) {
            links.push({url, title});
          }
        }
      },

      handleError(aError) {
        aCallback([]);
      },

      handleCompletion(aReason) {
        aCallback(links);
      },
    };

    let query = PlacesUtils.history.getNewQuery();
    let db = PlacesUtils.history;
    db.asyncExecuteLegacyQuery(query, options, callback);
  },

  remove(aCallback, aUrls) {
    let urls = [];
    aUrls.forEach(aUrl => {
      urls.push(Services.io.newURI(aUrl));
    });
    PlacesUtils.history.remove(urls).then(aCallback, Cu.reportError);
  },

  topHosts(aCallback, aHosts) {
    if (aHosts.length < 100) {
      aCallback([]);
      return;
    }
    let start = Date.now();
    let indexes = [];
    PlacesUtils.promiseDBConnection().then(db => {
      return db.execute(`SELECT :idx AS idx, count(v.id) As count
        FROM moz_historyvisits AS v JOIN moz_places AS h ON v.place_id = h.id
        WHERE v.visit_date >= strftime('%s', 'now', 'localtime', 'start of day', '-1 month', 'utc') * 1000000
          AND h.rev_host LIKE :rev_host;`,
        aHosts.map((host, idx) => {
          return {
            idx,
            rev_host: (host.split("").reverse().join("") + ".%"),
          };
        }),
        row => {
          let item = {
            idx: row.getResultByName("idx"),
            count: row.getResultByName("count"),
          };
          if (item.count < 1) {
            return;
          }
          indexes.push(item);
        }
      );
    }).then(() => {
      let msg = "Frequent.topHosts: " + (Date.now() - start) + "ms";
      Services.console.logStringMessage(msg);

      indexes.sort((x, y) => {
        return (y.count - x.count) || (x.idx - y.idx);
      });
      aCallback(indexes.slice(0, 20).map(item => {
        return item.idx;
      }));
    }, err => {
      Cu.reportError(err);
      aCallback([]);
    });
  },
};

var DefaultPreferences = new Preferences({
  branch: "",
  defaultBranch: true,
});
var getPref = (prefName, defaultValue, valueType, useDefaultBranch) => {
  let prefs = useDefaultBranch ? DefaultPreferences : Preferences;

  return prefs.get(prefName, defaultValue, valueType);
};

var Homepage = {
  defaultHomepage: "https://home.firefoxchina.cn/",
  distributionTopic: "distribution-customization-complete",
  historicalHomepages: [
    /^http:\/\/(home|e|n|i)\.firefoxchina\.cn\/?$/,
    /^about:cehome$/,
  ],
  homepagePref: "browser.startup.homepage",
  originalHomepage: "",
  vanillaHomepages: [
    /^https?:\/\/start\.firefoxchina\.cn\/?$/,
    /^about:home$/,
  ],

  init(isAppStartup) {
    if (!isAppStartup) {
      return;
    }

    let observers = Services.obs.enumerateObservers(this.distributionTopic);
    if (observers.hasMoreElements()) {
      Services.obs.addObserver(this, this.distributionTopic);
    } else {
      this.maybeOverrideHomepage();
    }
  },

  maybeOverrideHomepage() {
    let defaultHomepage = getPref(this.homepagePref, this.defaultHomepage,
      Ci.nsIPrefLocalizedString, true);
    if (defaultHomepage === this.defaultHomepage) {
      this.track("defaultVal");
      return;
    }

    let userHomepage = getPref(this.homepagePref, this.defaultHomepage,
      Ci.nsIPrefLocalizedString);
    if (userHomepage === this.defaultHomepage) {
      this.overrideHomepage("userVal");
      return;
    }

    if (this.historicalHomepages.some(h => h.test(defaultHomepage))) {
      this.overrideHomepage("legacyDist");
      return;
    }

    if (this.vanillaHomepages.some(v => v.test(defaultHomepage))) {
      this.overrideHomepage("vanilla");
      return;
    }

    this.track("otherDefault");

    try {
      Services.obs.removeObserver(this, this.distributionTopic);
    } catch (ex) {}
  },

  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case this.distributionTopic:
        this.maybeOverrideHomepage();
        break;
      default:
        break;
    }
  },

  overrideHomepage(reason) {
    if (!Services.prefs.prefHasUserValue(this.homepagePref)) {
      Services.prefs.setCharPref(this.homepagePref, this.defaultHomepage);
      reason = `${reason}Write`;
    }

    this.originalHomepage = getPref(this.homepagePref, this.defaultHomepage,
      Ci.nsIPrefLocalizedString, true);
    this.setAsDefault(this.defaultHomepage);

    this.track(reason);
  },

  setAsDefault(homepage) {
    if (!homepage) {
      return;
    }

    let localizedStr = Cc["@mozilla.org/pref-localizedstring;1"].
      createInstance(Ci.nsIPrefLocalizedString);
    localizedStr.data = `data:text/plain,${this.homepagePref}=${homepage}`;
    Services.prefs.getDefaultBranch("").setComplexValue(this.homepagePref,
      Ci.nsIPrefLocalizedString, localizedStr);
  },

  track(reason) {
    Tracking.track({
      type: "homepage",
      action: "override",
      sid: reason,
    });
  },

  uninit(isAppShutdown) {
    // revert on disable/uninstall ?
    if (!isAppShutdown) {
      return;
    }

    if (this.originalHomepage) {
      // so that this.defaultHomepage can be saved on user branch
      this.setAsDefault(this.originalHomepage);
    }
  },
};

var Session = Object.create(Frequent, {
  needsDeduplication: {
    value: true,
  },
  order: {
    value: Ci.nsINavHistoryQueryOptions.SORT_BY_DATE_DESCENDING,
  },
});
