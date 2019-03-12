/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global Cu, ExtensionAPI, Services, XPCOMUtils */
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils",
  "resource://gre/modules/PlacesUtils.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "resProto",
  "@mozilla.org/network/protocol;1?name=resource",
  "nsISubstitutingProtocolHandler");

const RESOURCE_HOST = "ntab";

this.chinaEditionHomepage = class extends ExtensionAPI {
  onStartup() {
    let {extension} = this;
    resProto.setSubstitution(RESOURCE_HOST,
      Services.io.newURI("legacy/", null, extension.rootURI));

    try {
      ChromeUtils.import("resource://ntab/CEHomepage.jsm", this);
      this.mozCNUtils.init({ extension });
    } catch (ex) {
      console.error(ex);
    }
  }

  onShutdown(reason) {
    try {
      this.mozCNUtils.uninit(reason === "APP_SHUTDOWN");
      Cu.unload("resource://ntab/CEHomepage.jsm");

      resProto.setSubstitution(RESOURCE_HOST, null);
    } catch (ex) {
      console.error(ex);
    }
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

  getAPI() {
    let chinaEditionHomepage = this;

    return {
      mozillaonline: {
        chinaEditionHomepage: {
          async getLegacyPartnerBookmarks() {
            return chinaEditionHomepage.getLegacyPartnerBookmarks();
          }
        },
      },
    };
  }
};
