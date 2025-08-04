/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
  NTabDB: "resource://ntab/NTabDB.sys.mjs",
  PREFERENCES_LOADED_EVENT: "resource://newtab/lib/AboutPreferences.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

let newTabPref = {
  extPrefKey: "moa.ntab.openInNewTab",
  inUse: true,

  specByWindow: new Map(),

  init() {
    Services.prefs.addObserver(this.extPrefKey, this);

    this.refresh(Services.prefs.getBoolPref(this.extPrefKey));

    try {
      Services.obs.addObserver(this, lazy.PREFERENCES_LOADED_EVENT);
    } catch (ex) {
      console.error(ex);
    }
  },

  uninit() {
    Services.prefs.removeObserver(this.extPrefKey, this);

    this.refresh(false);

    try {
      Services.obs.removeObserver(this, lazy.PREFERENCES_LOADED_EVENT);
    } catch (ex) {
      console.error(ex);
    }
  },

  onWindowOpened(win) {
    let isPrivate = lazy.PrivateBrowsingUtils.isWindowPrivate(win);
    let spec = lazy.NTabDB[isPrivate ? "privateSpec" : "spec"];

    this.specByWindow.set(win, spec);

    win.gInitialPages = win.gInitialPages.concat([
      spec, lazy.NTabDB.readOnlySpec,
    ]);

    if (!isPrivate) {
      return;
    }

    win.MOA = win.MOA || {};
    win.MOA.NTab = win.MOA.NTab || {};
    win.MOA.NTab.BrowserOpenTab = win.BrowserOpenTab;
    win.BrowserOpenTab = browserOpenTab.bind(win);
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
      case lazy.PREFERENCES_LOADED_EVENT:
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
    if (lazy.AboutNewTab.hasOwnProperty("newTabURL")) {
      if (this.inUse) {
        lazy.AboutNewTab.newTabURL = lazy.NTabDB.spec;
      } else if (lazy.AboutNewTab.newTabURL === lazy.NTabDB.spec) {
        lazy.AboutNewTab.resetNewTabURL();
      }
    } else if (this.inUse) {
      aboutNewTabService.newTabURL = lazy.NTabDB.spec;
    } else if (aboutNewTabService.newTabURL === lazy.NTabDB.spec) {
      lazy.AboutNewTab.resetNewTabURL();
    }
  },

  specForWindow(win) {
    return this.specByWindow.get(win) || lazy.NTabDB.spec;
  },
};

let browserOpenTab = function(objectOrEvent) {
  let evt;
  // Since Fx 108, see https://bugzil.la/1533058
  if (objectOrEvent) {
    evt = objectOrEvent.hasOwnProperty("event") ? objectOrEvent.event : objectOrEvent;
  }
  let win = (evt && evt.target && evt.target.ownerGlobal) || this;

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
  } else {
    win.MOA.NTab.BrowserOpenTab.call(win, objectOrEvent);
  }
};

export let NTabWindow = {
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
