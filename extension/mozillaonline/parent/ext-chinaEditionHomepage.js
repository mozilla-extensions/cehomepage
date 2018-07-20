/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global ExtensionAPI, Services, XPCOMUtils */
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "resProto",
  "@mozilla.org/network/protocol;1?name=resource",
  "nsISubstitutingProtocolHandler");

const RESOURCE_HOST = "ntab";

this.chinaEditionHomepage = class extends ExtensionAPI {
  onStartup() {
    let {extension} = this;
    resProto.setSubstitution(RESOURCE_HOST,
      Services.io.newURI("legacy/", null, extension.rootURI));

    ChromeUtils.import("resource://ntab/CEHomepage.jsm", this);
    this.mozCNUtils.init({ extension });
  }
  onShutdown(reason) {
    this.mozCNUtils.uninit(reason === "APP_SHUTDOWN");

    resProto.setSubstitution(RESOURCE_HOST, null);
  }
};
