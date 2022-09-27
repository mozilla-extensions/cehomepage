/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global globalThis */
/* eslint-env mozilla/frame-script */

// Since Fx 104, see https://bugzil.la/1667455,1780695
const Services =
  globalThis.Services ||
  ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
ChromeUtils.defineModuleGetter(this, "NTabDB",
  "resource://ntab/NTabDB.jsm");

let NTab = {
  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "content-document-global-created":
        if (!content || !aSubject || aSubject !== content) {
          return;
        }

        let docURI = aSubject.document.documentURIObject;

        if (docURI.prePath !== NTabDB.prePath) {
          return;
        }
        this.initTracking(aSubject);

        if (!docURI.equals(NTabDB.uri)) {
          return;
        }
        this.init(aSubject);
        break;
    }
  },
  initTracking(aSubject) {
    aSubject.addEventListener("mozCNUtils:Tracking", aEvt => {
      sendAsyncMessage("mozCNUtils:Tracking", aEvt.detail);
    }, true, true);
  },
  init(aSubject) {
    let messageName = "mozCNUtils:NTabSync";
    aSubject.addEventListener(messageName, aEvt => {
      if (aEvt.detail && aEvt.detail.dir == "content2fs") {
        sendAsyncMessage(messageName, aEvt.detail.data);
      }
    }, true, true);
  },
};

Services.obs.addObserver(NTab, "content-document-global-created");
