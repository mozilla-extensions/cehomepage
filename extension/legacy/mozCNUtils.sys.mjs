/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI: "resource:///modules/CustomizableUI.sys.mjs",
  HomePage: "resource:///modules/HomePage.sys.mjs",
  Preferences: "resource://gre/modules/Preferences.sys.mjs",
});

var DefaultPreferences = new lazy.Preferences({
  branch: "",
  defaultBranch: true,
});

var getPref = (prefName, defaultValue, valueType, useDefaultBranch) => {
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

  markAsAdded() {
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
      this.markAsAdded();
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

      this.markAsAdded();
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
      this.overrideHomepage();
      return;
    }

    if (this.historicalHomepages.some(h => h.test(defaultHomepage))) {
      this.overrideHomepage();
      return;
    }

    if (this.vanillaHomepages.some(v => v.test(defaultHomepage))) {
      this.overrideHomepage();
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

  overrideHomepage() {
    if (!Services.prefs.prefHasUserValue(this.homepagePref)) {
      Services.prefs.setCharPref(this.homepagePref, this.defaultHomepage);
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
