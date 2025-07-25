/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  CustomizableUI: "resource:///modules/CustomizableUI.sys.mjs",
  HomePage: "resource:///modules/HomePage.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  Preferences: "resource://gre/modules/Preferences.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

export var delayedSuggestBaidu = {
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

    let timeoutId = lazy.setTimeout(() => {
      this.notify(aBrowser, aURI);
    }, this.delay);
    aBrowser.setAttribute(this.attribute, timeoutId);
  },

  remove(aBrowser, aStatus = Cr.NS_OK) {
    if (aBrowser.hasAttribute(this.attribute)) {
      let timeoutId = aBrowser.getAttribute(this.attribute);
      aBrowser.removeAttribute(this.attribute);
      lazy.clearTimeout(parseInt(timeoutId, 10));
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

    let notificationBar  = notificationBox.appendNotification(
        this.notificationKey,
        {
          label: message,
          image,
          priority: notificationBox.PRIORITY_INFO_HIGH,
        },
        buttons
      );
    notificationBar.persistence = 1;
  },

  searchAndSwitchEngine(aBrowser, aKeyword) {
    let w = aBrowser.ownerGlobal;
    if (aKeyword) {
      let submission = this.baidu.getSubmission(aKeyword);
      // always replace in the current tab
      w.openWebLinkIn(submission.uri.spec, "current", {
        postData: submission.postData,
      });
    } else {
      w.openWebLinkIn(this.baidu.searchForm, "current");
    }

    if (Services.search.defaultEngine.name == "Google") {
      this.baidu.hidden = false;
      Services.search.defaultEngine = this.baidu;
    }
  },

  markNomore() {
    try {
      Services.prefs.setIntPref(this.prefKey, this.version);
    } catch (e) {}
  },
};

var DefaultPreferences = new lazy.Preferences({
  branch: "",
  defaultBranch: true,
});

export var getPref = (prefName, defaultValue, valueType, useDefaultBranch) => {
  let prefs = useDefaultBranch ? DefaultPreferences : lazy.Preferences;

  return prefs.get(prefName, defaultValue, valueType);
};

export var Homepage = {
  defaultHomepage: "https://home.firefoxchina.cn/",
  distributionTopic: "distribution-customization-complete",
  historicalHomepages: [
    /^http:\/\/(home|e|n|i)\.firefoxchina\.cn\/?$/,
    /^about:cehome$/,
  ],
  homeButtonPref: "extensions.cehomepage.homeButtonRestored",
  homepagePref: "browser.startup.homepage",
  originalHomepage: "",
  vanillaHomepages: [
    /^https?:\/\/start\.firefoxchina\.cn\/?$/,
    /^about:home$/,
  ],

  init(isAppStartup) {
    // Run this as soon as possible in a fresh profile
    if (!Services.appinfo.replacedLockTime) {
      this.maybeAddHomeButton();
    }

    if (!isAppStartup) {
      return;
    }

    let observers = Services.obs.enumerateObservers(this.distributionTopic);
    if (observers.hasMoreElements()) {
      Services.obs.addObserver(this, this.distributionTopic);
    } else {
      this.maybeOverrideHomepage();
      this.maybeAddHomeButton();
    }
  },

  markAsAdded(reason) {
    Services.prefs.setBoolPref(this.homeButtonPref, true);
  },

  maybeAddHomeButton() {
    if (Services.prefs.getBoolPref(this.homeButtonPref, false)) {
      return;
    }

    if (Services.vc.compare(Services.appinfo.version, "89.0") < 0) {
      return;
    }

    if (lazy.CustomizableUI.getWidget("home-button").areaType) {
      this.markAsAdded("available");
      return;
    }

    if (Services.appinfo.replacedLockTime) {
      let prefs = Services.prefs.getDefaultBranch("distribution.");
      if (prefs.getCharPref("id", "") !== "MozillaOnline") {
        return;
      }
      let version = prefs.getCharPref("version", "2007.6");
      if (Services.vc.compare(version, "2021.6") < 0) {
        return;
      }
    }

    if (lazy.HomePage && lazy.HomePage._maybeAddHomeButtonToToolbar) {
      lazy.HomePage._maybeAddHomeButtonToToolbar(this.defaultHomepage);

      this.markAsAdded("attempt");
      if (lazy.CustomizableUI.getWidget("home-button").areaType) {
      }
    }
  },

  maybeOverrideHomepage() {
    let defaultHomepage = getPref(this.homepagePref, this.defaultHomepage,
      Ci.nsIPrefLocalizedString, true);
    if (defaultHomepage === this.defaultHomepage) {
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

    try {
      Services.obs.removeObserver(this, this.distributionTopic);
    } catch (ex) {}
  },

  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case this.distributionTopic:
        this.maybeOverrideHomepage();
        this.maybeAddHomeButton();
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
