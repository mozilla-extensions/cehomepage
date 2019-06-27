/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global ExtensionAPI */
ChromeUtils.defineModuleGetter(this, "XPCOMUtils",
  "resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetters(this, {
  "PlacesUtils": "resource://gre/modules/PlacesUtils.jsm", /* global PlacesUtils */
  "Services": "resource://gre/modules/Services.jsm" /* global Services */
});
XPCOMUtils.defineLazyServiceGetter(this, "resProto",
  "@mozilla.org/network/protocol;1?name=resource",
  "nsISubstitutingProtocolHandler");

const RESOURCE_HOST = "ntab";

this.chinaEditionHomepage = class extends ExtensionAPI {
  onStartup() {
    let {extension} = this;

    this.flushCacheOnUpgrade(extension);

    resProto.setSubstitution(RESOURCE_HOST,
      Services.io.newURI("legacy/", null, extension.rootURI));

    try {
      ChromeUtils.import("resource://ntab/CEHomepage.jsm", this);
      this.mozCNUtils.init({ extension });
    } catch (ex) {
      console.error(ex);
    }
  }

  onShutdown(isAppShutdownOrReason) {
    try {
      // Boolean isAppShutdown since Fx 68, https://bugzil.la/1549192
      let isAppShutdown = isAppShutdownOrReason === true ||
                          isAppShutdownOrReason === "APP_SHUTDOWN";
      this.mozCNUtils.uninit(isAppShutdown);
      Cu.unload("resource://ntab/CEHomepage.jsm");

      resProto.setSubstitution(RESOURCE_HOST, null);
    } catch (ex) {
      console.error(ex);
    }
  }

  flushCacheOnUpgrade(extension) {
    if (extension.startupReason !== "ADDON_UPGRADE" ||
        Services.vc.compare(Services.appinfo.version, "67.0") < 0) {
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
      let db = await PlacesUtils.promiseDBConnection();
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
      PlacesUtils.favicons.setAndFetchFaviconForPage(
        Services.io.newURI(url), Services.io.newURI(faviconUrl), false,
        PlacesUtils.favicons.FAVICON_LOAD_NON_PRIVATE, null,
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
          }
        },
      },
    };
  }
};
