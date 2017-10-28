this.EXPORTED_SYMBOLS = ["NTabWindow"];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "aboutNewTabService",
  "@mozilla.org/browser/aboutnewtab-service;1", "nsIAboutNewTabService");
XPCOMUtils.defineLazyModuleGetter(this, "CustomizableUI",
  "resource:///modules/CustomizableUI.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PrivateBrowsingUtils",
  "resource://gre/modules/PrivateBrowsingUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "NTabDB",
  "resource://ntab/NTabDB.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Tracking",
  "resource://ntab/Tracking.jsm");

XPCOMUtils.defineLazyGetter(this, "gStrings", () => {
  return Services.strings.
    createBundle("chrome://ntab/locale/overlay.properties");
});

this.overrideInstallation = {
  prefKey: "moa.ntab.oldinstalldate",

  get oldInstallDate() {
    return Services.prefs.getCharPref(this.prefKey, "");
  },

  set oldInstallDate(val) {
    try {
      Services.prefs.setCharPref(this.prefKey, val);
    } catch (e) {}
  },

  get installDateFile() {
    var installDateFile = Services.dirsvc.get("XREExeF", Ci.nsIFile);
    installDateFile.leafName = "distribution";
    installDateFile.append("myextensions");
    installDateFile.append("installdate.ini");

    return installDateFile;
  },

  get newInstallDate() {
    var newInstallDate = "";
    var installDateFile = this.installDateFile;
    if (!installDateFile.exists() || installDateFile.isDirectory()) {
      return "";
    }

    var iniParser = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].
                      getService(Ci.nsIINIParserFactory).
                      createINIParser(installDateFile);
    var sections = iniParser.getSections();
    var section = null;

    while (sections.hasMore()) {
      section = sections.getNext();
      try {
        newInstallDate += iniParser.getString(section, "dwLowDateTime");
        newInstallDate += iniParser.getString(section, "dwHighDateTime");
      } catch (e) {
        return "";
      }
    }

    return newInstallDate;
  },

  get isOverride() {
    var everSet = !!this.oldInstallDate;
    var changed = this.oldInstallDate != this.newInstallDate;
    if (!changed) {
      delete this.isOverride;
      return this.isOverride = false;
    }

    this.oldInstallDate = this.newInstallDate;
    // only a change with an exisiting pref count as an override
    delete this.isOverride;
    return this.isOverride = everSet;
  }
};

this.homepageReset = {
  prefKeyHomepage: "browser.startup.homepage",
  prefKeyOtherNav: "moa.homepagereset.othernav.latestcheck",
  prefKeyPotentialHijack: "moa.homepagereset.potentialhijack.",

  notificationKey: "mo-reset-cehome",

  NO_REASON: 0,
  REASON_OVERRIDE_INSTALL: 1,
  REASON_OTHER_NAV: 2,
  REASON_POTENTIAL_HIJACK: 3,

  defaultHomepage: "http://home.firefoxchina.cn/",
  defaultHomepages: [
    /^http:\/\/[a-z]+\.firefoxchina\.cn/
  ],

  otherNavs: [
    /^https?:\/\/.*\.2345\.com/,
    /^https?:\/\/.*\.360\.cn/,
    /^https?:\/\/.*\.baidu\.com/,
    /^https?:\/\/.*\.duba\.com/,
    /^https?:\/\/.*\.hao123\.com/,
    /^https?:\/\/.*\.sogou\.com/
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
  currentCheck: 20170113,

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

    var ret = overrideInstallation.isOverride ?
      this.REASON_OVERRIDE_INSTALL :
      this.NO_REASON;

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

  check(aWindow) {
    var reason = this.shouldNotify();
    var shownCallback = this.markShown.bind(this);
    var nomoreCallback = this.markNomore.bind(this);

    if (reason == this.NO_REASON) {
      return;
    }

    switch (reason) {
      case this.REASON_OVERRIDE_INSTALL:
        this.notify(aWindow, reason);
        break;
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
      sid: reason
    });
  },

  notify(aWindow, aReason, aShownCallback, aNomoreCallback) {
    var message = gStrings.GetStringFromName("homepagereset.notification.message");
    if (aReason == this.REASON_POTENTIAL_HIJACK) {
      message = gStrings.GetStringFromName("homepagereset.notification.message_alt");
    }
    var resetText = gStrings.GetStringFromName("homepagereset.notification.reset");
    var noText = gStrings.GetStringFromName("homepagereset.notification.no");
    var nomoreText = gStrings.GetStringFromName("homepagereset.notification.nomore");

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
          href: (self.firstOtherNavUrl && self.firstOtherNavUrl.spec)
        });
      }
    }, {
      label: noText,
      accessKey: "N",
      callback() {
        Tracking.track({
          type: "homepagereset",
          action: "click",
          sid: "no"
        });
      }
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
            sid: "nomore"
          });
        }
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
  }
}

this.newTabPref = {
  extPrefKey: "moa.ntab.openInNewTab",
  inUse: true,

  specByWindow: new Map(),

  init() {
    Services.prefs.addObserver(this.extPrefKey, this);

    this.refresh(Services.prefs.getBoolPref(this.extPrefKey));
  },

  uninit() {
    Services.prefs.removeObserver(this.extPrefKey, this);

    this.refresh(false);
  },

  onWindowOpened(win) {
    let isPrivate = PrivateBrowsingUtils.isWindowPrivate(win);
    let spec = NTabDB[isPrivate ? "privateSpec" : "spec"];

    this.specByWindow.set(win, spec);

    win.gInitialPages = win.gInitialPages.concat([
      spec, NTabDB.readOnlySpec
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
    if (aTopic == "nsPref:changed") {
      switch (aData) {
        case newTabPref.extPrefKey:
          newTabPref.refresh(Services.prefs.getBoolPref(aData));
          break;
      }
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
    if (this.inUse) {
      aboutNewTabService.newTabURL = NTabDB.spec;
    } else {
      aboutNewTabService.resetNewTabURL();
    }
  },

  specForWindow(win) {
    return this.specByWindow.get(win) || NTabDB.spec;
  }
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

    var message = gStrings.GetStringFromName("permanent-pb.notification.message");
    var yesText = gStrings.GetStringFromName("permanent-pb.notification.yes");
    var moreText = gStrings.GetStringFromName("permanent-pb.notification.more");

    var self = this;
    var buttons = [{
      label: yesText,
      accessKey: "Y",
      callback() {
        self.disablePBAutoStart(win);

        self.shouldNotify = false;
        Tracking.track({
          type: "permanent-pb",
          action: "click",
          sid: "yes"
        });
      }
    }, {
      label: moreText,
      accessKey: "M",
      callback() {
        win.openPreferences("panePrivacy");

        self.shouldNotify = false;
        Tracking.track({
          type: "permanent-pb",
          action: "click",
          sid: "more"
        });
      }
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
      sid: "shown"
    });
  },

  disablePBAutoStart(win) {
    Services.prefs.setBoolPref("browser.privatebrowsing.autostart", false);

    var brandName = win.document.getElementById("bundle_brand").
      getString("brandShortName");
    var bundle = Services.strings.createBundle(
      "chrome://browser/locale/preferences/preferences.properties");
    var msg = bundle.formatStringFromName("featureDisableRequiresRestart",
                                          [brandName], 1);
    var title = bundle.formatStringFromName("shouldRestartTitle",
                                            [brandName], 1);
    var shouldProceed = Services.prompt.confirm(win, title, msg)
    if (shouldProceed) {
      var cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].
                          createInstance(Ci.nsISupportsPRBool);
      Services.obs.notifyObservers(cancelQuit, "quit-application-requested",
                                    "restart");
      shouldProceed = !cancelQuit.data;

      if (shouldProceed) {
        let appStartup = Cc["@mozilla.org/toolkit/app-startup;1"].
                            getService(Ci.nsIAppStartup);
        appStartup.quit(Ci.nsIAppStartup.eAttemptQuit |
                        Ci.nsIAppStartup.eRestart);
      }
    }
  }
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
    win.openUILinkIn(spec, where, { relatedToCurrent });

    // focus automatically for cases not covered by openUILinkIn
    if (!win.isBlankPageURL(spec)) {
      win.focusAndSelectUrlBar();
    }

    if (PrivateBrowsingUtils.isWindowPrivate(win) &&
        PrivateBrowsingUtils.permanentPrivateBrowsing) {
      permanentPB.notify(win);
    }

    Tracking.track({
      type: "opentab",
      action: "click",
      sid: "ntab"
    });
  } else {
    win.MOA.NTab.BrowserOpenTab.call(win, evt);

    Tracking.track({
      type: "opentab",
      action: "click",
      sid: "newtab"
    });
  }
};

this.NTabWindow = {
  init() {
    newTabPref.init();
  },

  uninit() {
    newTabPref.uninit();
  },

  onWindowOpened(win) {
    newTabPref.onWindowOpened(win);
  },

  onWindowClosed(win) {
    newTabPref.onWindowClosed(win);
  }
};
