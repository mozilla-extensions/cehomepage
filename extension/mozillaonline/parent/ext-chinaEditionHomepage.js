/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global ExtensionAPI, Services */

"use strict";

const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetter(this, "resProto",
  "@mozilla.org/network/protocol;1?name=resource",
  "nsISubstitutingProtocolHandler");

const RESOURCE_HOST = "ntab";

if (Services.prefs.getCharPref("distribution.id", "").trim().toLowerCase() !== "mozillaonline") {
  throw new Error("This extension is not supported for this distribution!");
}

this.chinaEditionHomepage = class extends ExtensionAPI {
  onStartup() {
    let {extension} = this;

    this.flushCacheOnUpgrade(extension);

    resProto.setSubstitutionWithFlags(RESOURCE_HOST,
      Services.io.newURI("legacy/", null, extension.rootURI), Ci.nsISubstitutingProtocolHandler.ALLOW_CONTENT_ACCESS);

    try {
      const { mozCNUtils } = ChromeUtils.importESModule("resource://ntab/CEHomepage.sys.mjs");
      this.mozCNUtils = mozCNUtils;
       this.mozCNUtils.init({ extension });
    } catch (ex) {
      console.error(ex);
    }
  }

  onShutdown(isAppShutdown) {
    try {
      this.mozCNUtils.uninit(isAppShutdown);

      resProto.setSubstitution(RESOURCE_HOST, null);
    } catch (ex) {
      console.error(ex);
    }
  }

  flushCacheOnUpgrade(extension) {
    if (extension.startupReason !== "ADDON_UPGRADE") {
      return;
    }

    // Taken from https://bugzil.la/1445739
    Services.obs.notifyObservers(null, "startupcache-invalidate");
    Services.obs.notifyObservers(null, "message-manager-flush-caches");
    Services.mm.broadcastAsyncMessage("AddonMessageManagerCachesFlush", null);
  }
};
