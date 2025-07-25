/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  CustomizableUI: "resource:///modules/CustomizableUI.sys.mjs",

  // Internal modules
  delayedSuggestBaidu: "resource://ntab/mozCNUtils.sys.mjs",
  Homepage: "resource://ntab/mozCNUtils.sys.mjs",
  NTabDB: "resource://ntab/NTabDB.sys.mjs",
  NTabWindow: "resource://ntab/NTabWindow.sys.mjs",
});

let strings = {
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
  },
};

let morePermissionPromptHack = {
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

    let addon = await lazy.AddonManager.getAddonByID(this.extensionId);
    addon.findUpdates({
      onUpdateAvailable(addon, install) {
        if (addon.permissions & lazy.AddonManager.PERM_CAN_UPGRADE &&
            lazy.AddonManager.shouldAutoUpdate(addon)) {
          // Trigger the installation w/o the permission prompt
          install.install();
        }
      },
    }, lazy.AddonManager.UPDATE_WHEN_PERIODIC_UPDATE);
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
  },
};

export let mozCNUtils = {
  // TabsProgressListener variant of nsIWebProgressListener
  onStateChange(aBrowser, aWebProgress, aRequest, aStateFlags, aStatus) {
    if (aWebProgress.isTopLevel &&
        (aStateFlags & Ci.nsIWebProgressListener.STATE_IS_WINDOW)) {
      let isStart = aStateFlags & Ci.nsIWebProgressListener.STATE_START;
      let isStop = aStateFlags & Ci.nsIWebProgressListener.STATE_STOP;
      if (!isStart && !isStop) {
        return;
      }

      if (lazy.delayedSuggestBaidu.isGoogleSearch(aRequest.URI)) {
        if (isStart) {
          lazy.delayedSuggestBaidu.attach(aBrowser, aRequest.URI);
        }
        if (isStop) {
          lazy.delayedSuggestBaidu.remove(aBrowser, aStatus);
        }
      }
    }
  },

  onLocationChange(aBrowser, b, aRequest, aLocation, aFlags) {
    if (aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_ERROR_PAGE) {
      // before we can fix the OfflineCacheInstaller ?
      if (aLocation.equals(lazy.NTabDB.uri)) {
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

  initWindowListener() {
    for (let win of lazy.CustomizableUI.windows) {
      this.onWindowOpened(win);
    }

    lazy.CustomizableUI.addListener(this);
  },

  uninitWindowListener() {
    lazy.CustomizableUI.removeListener(this);

    for (let win of lazy.CustomizableUI.windows) {
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
    lazy.NTabWindow.onWindowOpened(win);
  },

  onWindowClosed(win) {
    win.gBrowser.removeTabsProgressListener(this);
    lazy.NTabWindow.onWindowClosed(win);
  },

  init(context) {
    morePermissionPromptHack.init(context);
    let isAppStartup = context.extension.startupReason === "APP_STARTUP";
    strings.init(context);

    this.initDefaultPrefs();

    lazy.delayedSuggestBaidu.init(strings);
    lazy.Homepage.init(isAppStartup);
    lazy.NTabWindow.init(strings);

    // this needs to run after NTabWindow.init for strings
    this.initWindowListener();
  },

  uninit(isAppShutdown) {
    this.uninitWindowListener();

    lazy.Homepage.uninit(isAppShutdown);
    morePermissionPromptHack.uninit(isAppShutdown);
    lazy.NTabWindow.uninit();
  },
};
