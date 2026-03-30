/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global ExtensionAPI, Services */

"use strict";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
});

this.chinaEditionHomepage = class extends ExtensionAPI {
  onStartup() {
    // If user homepage points to any firefoxchina.cn or firefox.com.cn domain
    // (incl. subdomains), clear it to default and reset New Tab behavior
    try {
      if (Services.prefs.prefHasUserValue("browser.startup.homepage")) {
        const userHP = Services.prefs.getCharPref("browser.startup.homepage", "");
        if (userHP.includes("firefoxchina.cn") || userHP.includes("firefox.com.cn")) {
          Services.prefs.clearUserPref("browser.startup.homepage");

          if (lazy.AboutNewTab && typeof lazy.AboutNewTab.resetNewTabURL === "function") {
            lazy.AboutNewTab.resetNewTabURL();
          }
        }
      }
    } catch (ex) {
      console.error("Failed to clear user homepage when matching CN defaults", ex);
    }
  }

  onShutdown(isAppShutdown) {
  }
};
