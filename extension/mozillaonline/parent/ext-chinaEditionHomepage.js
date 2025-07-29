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

  async getLegacyPartnerBookmarks() {
    let updates = {};
    try {
      let db = await lazy.PlacesUtils.promiseDBConnection();
      await db.execute(`
SELECT
  b.guid,
  k.keyword
FROM
  moz_bookmarks AS b
JOIN
  moz_keywords AS k
ON
  b.fk = k.place_id
WHERE
  k.keyword LIKE :keyword;
`,
        { keyword: "mozcn:%" },
        row => {
          let guid = row.getResultByName("guid");
          let keyword = row.getResultByName("keyword");
          // Possible duplication ?
          updates[keyword.replace(/^mozcn/, "partnerbookmarks")] = guid;
        }
      );
      return updates;
    } catch (err) {
      console.error(err);
      return {};
    }
  }

  async setFaviconForUrl(url, faviconUrl) {
    try {
      lazy.PlacesUtils.favicons.setAndFetchFaviconForPage(
        Services.io.newURI(url), Services.io.newURI(faviconUrl), false,
        lazy.PlacesUtils.favicons.FAVICON_LOAD_NON_PRIVATE, null,
        Services.scriptSecurityManager.getSystemPrincipal());
    } catch (ex) {
      console.error(ex);
    }
  }

  getAPI() {
    let chinaEditionHomepage = this;

    return {
      mozillaonline: {
        chinaEditionHomepage: {
          async getLegacyPartnerBookmarks() {
            return chinaEditionHomepage.getLegacyPartnerBookmarks();
          },

          async setFaviconForUrl(url, faviconUrl) {
            return chinaEditionHomepage.setFaviconForUrl(url, faviconUrl);
          },
        },
      },
    };
  }
};
