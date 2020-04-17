this.EXPORTED_SYMBOLS = ["NTabWindow"];

ChromeUtils.defineModuleGetter(this, "XPCOMUtils",
  "resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "aboutNewTabService",
  "@mozilla.org/browser/aboutnewtab-service;1", "nsIAboutNewTabService");
XPCOMUtils.defineLazyModuleGetters(this, {
  AboutNewTab: "resource:///modules/AboutNewTab.jsm",
  NTabDB: "resource://ntab/NTabDB.jsm",
  PREFERENCES_LOADED_EVENT: "resource://activity-stream/lib/AboutPreferences.jsm",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.jsm",
  Services: "resource://gre/modules/Services.jsm",
  Tracking: "resource://ntab/Tracking.jsm",
});

this.homepageReset = {
  prefKeyHomepage: "browser.startup.homepage",
  prefKeyOtherNav: "moa.homepagereset.othernav.latestcheck",
  prefKeyPotentialHijack: "moa.homepagereset.potentialhijack.",

  notificationKey: "mo-reset-cehome",

  NO_REASON: 0,
  // No longer used, but keep it here to avoid any confusion
  // REASON_OVERRIDE_INSTALL: 1,
  REASON_OTHER_NAV: 2,
  REASON_POTENTIAL_HIJACK: 3,

  defaultHomepage: "https://home.firefoxchina.cn/",
  defaultHomepages: [
    /^https?:\/\/[a-z]+\.firefoxchina\.cn/,
  ],

  otherNavs: [
    /^https?:\/\/.*\.2345\.com/,
    /^https?:\/\/.*\.360\.cn/,
    /^https?:\/\/.*\.baidu\.com/,
    /^https?:\/\/.*\.duba\.com/,
    /^https?:\/\/.*\.hao123\.com/,
    /^https?:\/\/.*\.sogou\.com/,
  ],
  firstOtherNavUrl: null,

  get homepage() {
    var homepages = [this.defaultHomepage];
    try {
      homepages = Services.prefs.getComplexValue(this.prefKeyHomepage,
        Ci.nsIPrefLocalizedString).data.split("|");
    } catch (e) {}
    return homepages;
  },

  set homepage(homepage) {
    var defaultHomepages = [homepage];
    try {
      defaultHomepages = Services.prefs.getDefaultBranch("").
        getComplexValue(this.prefKeyHomepage,
          Ci.nsIPrefLocalizedString).data.split("|");
    } catch (e) {}

    var defaultHomepageIsCEHome =
      defaultHomepages.some(function(defaultHomepage) {
        return homepage == defaultHomepage;
      });

    if (defaultHomepageIsCEHome) {
      Services.prefs.clearUserPref(this.prefKeyHomepage);
    } else {
      try {
        Services.prefs.setCharPref(this.prefKeyHomepage, homepage);
      } catch (e) {}
    }
  },

  // for comparison, using int instead of string
  currentCheck: 20190304,

  get latestCheck() {
    return Services.prefs.getIntPref(this.prefKeyOtherNav, 0);
  },

  set latestCheck(day) {
    try {
      Services.prefs.setIntPref(this.prefKeyOtherNav, day);
    } catch (e) {}
  },

  shouldNotify() {
    var homepages = this.homepage;
    var usingCEHome = this.defaultHomepages.some(function(regex) {
      return homepages.some(function(homepage) {
        return regex.test(homepage);
      });
    });

    if (usingCEHome) {
      return this.NO_REASON;
    }

    var ret = this.NO_REASON;

    var firstOtherNav = "";
    var usingOtherNav = this.otherNavs.some(function(regex) {
      return homepages.some(function(homepage) {
        var match = regex.test(homepage);
        if (match) {
          firstOtherNav = homepage;
        }
        return match;
      });
    });

    if (!usingOtherNav) {
      return ret;
    }

    this.firstOtherNavUrl = Services.io.newURI(firstOtherNav)
                                    .QueryInterface(Ci.nsIURL);
    if (this.firstOtherNavUrl.query) {
      var latestCheck = 0;
      try {
        var prefKey = this.prefKeyPotentialHijack + this.firstOtherNavUrl.asciiHost;
        latestCheck = Services.prefs.getIntPref(prefKey);
      } catch (e) {}
      if (latestCheck < this.currentCheck) {
        return this.REASON_POTENTIAL_HIJACK;
      }
      return ret;
    }
    if (this.latestCheck < this.currentCheck) {
      return this.REASON_OTHER_NAV;
    }
    return ret;
  },

  markShown() {
    this.latestCheck = this.currentCheck;
  },

  markNomore() {
    var prefKey = this.prefKeyPotentialHijack + this.firstOtherNavUrl.asciiHost;
    try {
      Services.prefs.setIntPref(prefKey, this.currentCheck);
    } catch (e) {}
  },

  handleEvent(evt) {
    switch (evt.type) {
      case "DOMContentLoaded":
        let win = evt.target.defaultView;
        win.setTimeout(() => {
          this.check(win);
        }, 0);
        break;
      default:
        break;
    }
  },

  check(aWindow) {
    if (!aWindow.gBrowser) {
      aWindow.addEventListener("DOMContentLoaded", this, { once: true });
      return;
    }

    var reason = this.shouldNotify();
    var shownCallback = this.markShown.bind(this);
    var nomoreCallback = this.markNomore.bind(this);

    if (reason == this.NO_REASON) {
      return;
    }

    switch (reason) {
      case this.REASON_OTHER_NAV:
        this.notify(aWindow, reason, shownCallback);
        break;
      case this.REASON_POTENTIAL_HIJACK:
        this.notify(aWindow, reason, shownCallback, nomoreCallback);
        break;
      default:
        break;
    }

    Tracking.track({
      type: "homepagereset",
      action: "notify",
      sid: reason,
    });
  },

  notify(aWindow, aReason, aShownCallback, aNomoreCallback) {
    var message = NTabWindow._("homepageReset.notification.message");
    if (aReason == this.REASON_POTENTIAL_HIJACK) {
      message = NTabWindow._("homepageReset.notification.message_alt");
    }
    var resetText = NTabWindow._("homepageReset.notification.reset");
    var noText = NTabWindow._("homepageReset.notification.no");
    var nomoreText = NTabWindow._("homepageReset.notification.nomore");

    var self = this;
    var buttons = [{
      label: resetText,
      accessKey: "R",
      callback() {
        self.reset();

        Tracking.track({
          type: "homepagereset",
          action: "click",
          sid: "yes",
          href: (self.firstOtherNavUrl && self.firstOtherNavUrl.spec),
        });
      },
    }, {
      label: noText,
      accessKey: "N",
      callback() {
        Tracking.track({
          type: "homepagereset",
          action: "click",
          sid: "no",
        });
      },
    }];

    if (aNomoreCallback) {
      buttons.push({
        label: nomoreText,
        accessKey: "D",
        callback() {
          aNomoreCallback();

          Tracking.track({
            type: "homepagereset",
            action: "click",
            sid: "nomore",
          });
        },
      });
    }

    var notificationBox = aWindow.gBrowser.getNotificationBox();
    var notificationBar =
      notificationBox.appendNotification(message, this.notificationKey, "",
        notificationBox.PRIORITY_INFO_MEDIUM, buttons);
    if (aShownCallback) {
      aShownCallback();
    }
    notificationBar.persistence = -1;
  },

  reset() {
    this.homepage = this.defaultHomepage;
  },
};

this.newTabPref = {
  extPrefKey: "moa.ntab.openInNewTab",
  inUse: true,

  specByWindow: new Map(),

  init() {
    Services.prefs.addObserver(this.extPrefKey, this);

    this.refresh(Services.prefs.getBoolPref(this.extPrefKey));

    try {
      Services.obs.addObserver(this, PREFERENCES_LOADED_EVENT);
    } catch (ex) {
      Cu.reportError(ex);
    }
  },

  uninit() {
    Services.prefs.removeObserver(this.extPrefKey, this);

    this.refresh(false);

    try {
      Services.obs.removeObserver(this, PREFERENCES_LOADED_EVENT);
    } catch (ex) {
      Cu.reportError(ex);
    }
  },

  onWindowOpened(win) {
    let isPrivate = PrivateBrowsingUtils.isWindowPrivate(win);
    let spec = NTabDB[isPrivate ? "privateSpec" : "spec"];

    this.specByWindow.set(win, spec);

    win.gInitialPages = win.gInitialPages.concat([
      spec, NTabDB.readOnlySpec,
    ]);

    homepageReset.check(win);

    if (!isPrivate) {
      return;
    }

    win.MOA = win.MOA || {};
    win.MOA.NTab = win.MOA.NTab || {};
    win.MOA.NTab.BrowserOpenTab = win.BrowserOpenTab;
    win.BrowserOpenTab = browserOpenTab;
  },

  onWindowClosed(win) {
    this.specByWindow.delete(win);

    // gInitialPages etc.

    if (win.MOA && win.MOA.NTab && win.MOA.NTab.BrowserOpenTab) {
      win.BrowserOpenTab = win.MOA.NTab.BrowserOpenTab;
      delete win.MOA.NTab.BrowserOpenTab;
    }
  },

  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "nsPref:changed":
        if (aData !== newTabPref.extPrefKey) {
          break;
        }
        newTabPref.refresh(Services.prefs.getBoolPref(aData));
        break;
      case PREFERENCES_LOADED_EVENT:
        let doc = aSubject.document;
        let encodedCSS = encodeURIComponent(`
#homeContentsGroup {
  display: none;
}
`);
        doc.insertBefore(doc.createProcessingInstruction("xml-stylesheet",
          `href="data:text/css,${encodedCSS}" type="text/css"`),
          doc.documentElement);
        break;
      default:
        break;
    }
  },

  refresh(inUse) {
    this.inUse = inUse;
    /*
      * if using offlintab (different urls for pb/non-pb window):
      * set the new tab url to NTabDB.spec instead of this.spec to
      * prevent updating BROWSER_NEW_TAB_URL in every window based on
      * the most recently opened window.
      *
      * if not using offlintab:
      * reset the new tab url to make sure about:privatebrowsing will be
      * opened in (non-permanent) pb mode.
      */
    // Since Fx 76, see https://bugzil.la/1619992
    if (AboutNewTab.hasOwnProperty("newTabURL")) {
      if (this.inUse) {
        AboutNewTab.newTabURL = NTabDB.spec;
      } else if (AboutNewTab.newTabURL === NTabDB.spec) {
        AboutNewTab.resetNewTabURL();
      }
    } else if (this.inUse) {
      aboutNewTabService.newTabURL = NTabDB.spec;
    } else if (aboutNewTabService.newTabURL === NTabDB.spec) {
      aboutNewTabService.resetNewTabURL();
    }
  },

  specForWindow(win) {
    return this.specByWindow.get(win) || NTabDB.spec;
  },
};

this.permanentPB = {
  prefKey: "moa.permanent-pb.notify",
  notificationKey: "mo-permanent-pb",

  get shouldNotify() {
    return Services.prefs.getBoolPref(this.prefKey, true);
  },

  set shouldNotify(aShouldNotify) {
    try {
      Services.prefs.setBoolPref(this.prefKey, !!aShouldNotify);
    } catch (e) {}
  },

  notify(win) {
    if (!this.shouldNotify) {
      return;
    }

    var message = NTabWindow._("permanentPB.notification.message");
    var yesText = NTabWindow._("permanentPB.notification.yes");
    var moreText = NTabWindow._("permanentPB.notification.more");

    var self = this;
    var buttons = [{
      label: yesText,
      accessKey: "Y",
      callback() {
        self.shouldNotify = false;
        Tracking.track({
          type: "permanent-pb",
          action: "click",
          sid: "yes",
        });

        // Set pref etc. before we try to restart the browser.
        self.disablePBAutoStart(win);
      },
    }, {
      label: moreText,
      accessKey: "M",
      callback() {
        win.openPreferences("panePrivacy");

        self.shouldNotify = false;
        Tracking.track({
          type: "permanent-pb",
          action: "click",
          sid: "more",
        });
      },
    }];

    var notificationBox = win.gBrowser.getNotificationBox();
    var notificationBar =
      notificationBox.appendNotification(message, this.notificationKey,
        "chrome://browser/skin/Privacy-16.png",
        notificationBox.PRIORITY_INFO_MEDIUM, buttons);
    // persist across the about:blank -> newTabPref.specForWindow(win) change
    notificationBar.persistence = 1;

    Tracking.track({
      type: "permanent-pb",
      action: "notify",
      sid: "shown",
    });
  },

  disablePBAutoStart(win) {
    Services.prefs.setBoolPref("browser.privatebrowsing.autostart", false);

    var brandName = win.document.getElementById("bundle_brand").
      getString("brandShortName");
    var msg = NTabWindow._("permanentPB.restart.message", [brandName]);
    var title = NTabWindow._("permanentPB.restart.title", [brandName]);
    var shouldProceed = Services.prompt.confirm(win, title, msg);
    if (shouldProceed) {
      var cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].
                          createInstance(Ci.nsISupportsPRBool);
      Services.obs.notifyObservers(cancelQuit, "quit-application-requested",
                                    "restart");
      shouldProceed = !cancelQuit.data;

      if (shouldProceed) {
        Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit |
                              Ci.nsIAppStartup.eRestart);
      }
    }
  },
};

this.browserOpenTab = function(evt) {
  let win = evt.target.ownerGlobal || this;

  if (newTabPref.inUse) {
    let where = "tab";
    let relatedToCurrent = false;

    if (evt) {
      where = win.whereToOpenLink(evt, false, true);

      switch (where) {
        case "tab":
        case "tabshifted":
          relatedToCurrent = true;
          break;
        case "current":
          where = "tab";
          break;
      }
    }

    var spec = newTabPref.specForWindow(win);
    win.openWebLinkIn(spec, where, { relatedToCurrent });

    // focus automatically for cases not covered by openUILinkIn
    if (!win.isBlankPageURL(spec)) {
      // Removed in Fx 76, see https://bugzil.la/1362866,1610479
      if (win.focusAndSelectUrlBar) {
        win.focusAndSelectUrlBar();
      } else {
        win.gURLBar.select();
      }
    }

    if (PrivateBrowsingUtils.isWindowPrivate(win) &&
        PrivateBrowsingUtils.permanentPrivateBrowsing) {
      permanentPB.notify(win);
    }

    Tracking.track({
      type: "opentab",
      action: "click",
      sid: "ntab",
    });
  } else {
    win.MOA.NTab.BrowserOpenTab.call(win, evt);

    Tracking.track({
      type: "opentab",
      action: "click",
      sid: "newtab",
    });
  }
};

this.NTabWindow = {
  _(key, args) {
    return this._strings ? this._strings._(key, args) : "";
  },

  init(strings) {
    this._strings = strings;
    newTabPref.init();
  },

  uninit() {
    newTabPref.uninit();
    delete this.strings;
  },

  onWindowOpened(win) {
    newTabPref.onWindowOpened(win);
  },

  onWindowClosed(win) {
    newTabPref.onWindowClosed(win);
  },
};
