this.EXPORTED_SYMBOLS = [
  "delayedSuggestBaidu", "Frequent", "getPref", "Homepage",
  "Session", "SignatureVerifier"
];

const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "AddonManager",
  "resource://gre/modules/AddonManager.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils",
  "resource://gre/modules/PlacesUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Preferences",
  "resource://gre/modules/Preferences.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "setTimeout",
  "resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "clearTimeout",
  "resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "sessionStore",
  "@mozilla.org/browser/sessionstore;1", "nsISessionStore");

XPCOMUtils.defineLazyModuleGetter(this, "Tracking",
  "resource://ntab/Tracking.jsm");

var delayedSuggestBaidu = {
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
    return (getPref(this.prefKey, 0) < this.version) && this.baidu;
  },

  init() {
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

    if (this.knownStatus.indexOf(aStatus) < 0) {
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
        })
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
        callback() {
          self.searchAndSwitchEngine(aBrowser, keyword);
        }
      }, {
        label: negative,
        accessKey: "N",
        callback() {
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

  searchAndSwitchEngine(aBrowser, aKeyword) {
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

  markNomore() {
    try {
      Services.prefs.setIntPref(this.prefKey, this.version);
    } catch (e) {}

    Tracking.track({
      type: "delayedsuggestbaidu",
      action: "click",
      sid: "nomore"
    });
  }
};

var Frequent = {
  excludes: [
    /^http:\/\/[a-z]+.firefoxchina.cn\/n(ew)?tab/,
    /^http:\/\/[a-z]+.firefoxchina.cn\/parts\/google_rdr/,
    /^http:\/\/[a-z]+.firefoxchina.cn\/redirect\/adblock/,
    /^http:\/\/[a-z]+.firefoxchina.cn\/(redirect\/)?search/,
    /^http:\/\/i.g-fox.cn\/(rd|search)/,
    /^http:\/\/www5.1616.net\/q/
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
      }
    };

    let query = PlacesUtils.history.getNewQuery();
    let db = PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase);
    db.asyncExecuteLegacyQueries([query], 1, options, callback);
  },

  remove(aUrls) {
    let urls = [];
    aUrls.forEach(aUrl => {
      urls.push(Services.io.newURI(aUrl));
    });
    PlacesUtils.bhistory.removePages(urls, urls.length);
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
            rev_host: (host.split("").reverse().join("") + ".%")
          }
        }),
        row => {
          let item = {
            idx: row.getResultByName("idx"),
            count: row.getResultByName("count")
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
  }
};

var DefaultPreferences = new Preferences({
  branch: "",
  defaultBranch: true
});
var getPref = (prefName, defaultValue, valueType, useDefaultBranch) => {
  let prefs = useDefaultBranch ? DefaultPreferences : Preferences;

  return prefs.get(prefName, defaultValue, valueType);
};

var Homepage = {
  defaultAboutpage: "http://home.firefoxchina.cn/",
  defaultHomepage: "http://home.firefoxchina.cn/",
  historicalAboutpages: [
    "http://e.firefoxchina.cn/",
    "http://n.firefoxchina.cn/",
    "http://i.firefoxchina.cn/"
  ],
  historicalHomepage: "about:cehome",
  vanillaHomepages: [
    "about:home",
    "http://start.firefoxchina.cn/"
  ],

  distributionTopic: "distribution-customization-complete",
  homepagePref: "browser.startup.homepage",

  get aboutpage() {
    delete this.aboutpage;
    return this.aboutpage = this.defaultAboutpage;
  },
  get homepage() {
    return getPref(this.homepagePref, this.defaultHomepage,
      Ci.nsIPrefLocalizedString);
  },
  normalizeSpec(aSpec) {
    try {
      let uri = Services.uriFixup.createFixupURI(aSpec,
        Services.uriFixup.FIXUP_FLAG_NONE);

      // ignore the "?cachebust=***" when comparing with this.aboutpage etc.
      let uriWithoutQS = uri.spec.split("?")[0];
      if (uriWithoutQS === this.aboutpage ||
          uriWithoutQS === this.historicalHomepage ||
          this.historicalAboutpages.some(historicalAboutpage => {
            return uriWithoutQS === historicalAboutpage;
          })) {
        return this.defaultHomepage;
      }
      return uri.spec;
    } catch (e) {
      return "";
    }
  },
  init(isAppStartup) {
    this.defaultPrefTweak(isAppStartup);

    this.handleDistributionDefaults(isAppStartup);
  },
  defaultPrefTweak(isAppStartup) {
    let defaultHomepage = getPref(this.homepagePref, this.defaultHomepage,
      Ci.nsIPrefLocalizedString, true);

    let updatedHomepage = defaultHomepage.split("|").map(spec => {
      // for china repack installation
      let normalizedSpec = this.normalizeSpec(spec) || spec;
      // for vanilla installation
      if (this.vanillaHomepages.includes(normalizedSpec)) {
        return this.defaultHomepage;
      }

      return normalizedSpec;
    }).join("|");

    if (updatedHomepage === defaultHomepage) {
      return;
    }

    let localizedStr = Cc["@mozilla.org/pref-localizedstring;1"].
      createInstance(Ci.nsIPrefLocalizedString);
    localizedStr.
      data = `data:text/plain,${this.homepagePref}=${updatedHomepage}`;
    Services.prefs.getDefaultBranch("").setComplexValue(this.homepagePref,
      Ci.nsIPrefLocalizedString, localizedStr);

    // isAppStartup here could be true/false/undefined
    if (isAppStartup === false) {
      this.maybeResetHomepage();
    }
  },
  handleDistributionDefaults(isAppStartup) {
    if (!isAppStartup) {
      return;
    }

    Services.obs.addObserver(this, this.distributionTopic);
    Services.prefs.addObserver(this.homepagePref, this);
  },
  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case this.distributionTopic:
        Services.prefs.removeObserver(this.homepagePref, this);
        Services.obs.removeObserver(this, aTopic);

        this.maybeResetHomepage();
        break;
      case "nsPref:changed":
        if (aData !== this.homepagePref) {
          break;
        }

        this.defaultPrefTweak();
        break;
    }
  },
  // Try to reset any unnecessary user value here.
  maybeResetHomepage() {
    if (!Services.prefs.prefHasUserValue(this.homepagePref)) {
      return;
    }

    let defaultHomepage = getPref(this.homepagePref, this.defaultHomepage,
      Ci.nsIPrefLocalizedString, true);

    if (this.homepage !== defaultHomepage &&
        this.homepage !== this.defaultHomepage) {
      return;
    }

    Services.prefs.clearUserPref(this.homepagePref);
    Tracking.track({
      type: "homepage",
      action: "reset",
      sid: "startup"
    });
  }
};

var Session = Object.create(Frequent, {
  needsDeduplication: {
    value: true
  },
  order: {
    value: Ci.nsINavHistoryQueryOptions.SORT_BY_DATE_DESCENDING
  }
});

var SignatureVerifier = {
  get verifier() {
    delete this.verifier;
    return this.verifier = Cc["@mozilla.org/security/datasignatureverifier;1"].
      getService(Ci.nsIDataSignatureVerifier);
  },

  get key() {
    delete this.key;
    return this.key = getPref("moa.signatureverifier.key", "");
  },

  verify(aData, aSignature) {
    try {
      return this.verifier.verifyData(aData, aSignature, this.key);
    } catch (e) {
      return false;
    }
  }
};
