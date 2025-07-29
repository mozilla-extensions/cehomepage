/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global content, sendAsyncMessage, Services */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  NTabDB: "resource://ntab/NTabDB.sys.mjs",
});

let NTab = {
  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "content-document-global-created":
        if (!content || !aSubject || aSubject !== content) {
          return;
        }

        let docURI = aSubject.document.documentURIObject;

        if (docURI.prePath !== lazy.NTabDB.prePath) {
          return;
        }

        if (!docURI.equals(lazy.NTabDB.uri)) {
          return;
        }
        this.init(aSubject);
        break;
    }
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
