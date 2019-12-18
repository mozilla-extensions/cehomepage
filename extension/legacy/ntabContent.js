/* eslint-env mozilla/frame-script */

/* global Services */
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
