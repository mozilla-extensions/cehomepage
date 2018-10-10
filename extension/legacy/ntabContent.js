/* eslint-env mozilla/frame-script */

let Cu = Components.utils;
let Ci = Components.interfaces;
let Cc = Components.classes;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "NTabDB",
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
    let document = aSubject.document;

    let Launcher = {
      get launcher() {
        delete this.launcher;
        return this.launcher = document.querySelector("#launcher");
      },
      get tools() {
        delete this.tools;
        return this.tools = document.querySelector('li[data-menu="tools"]');
      },
      init: function Launcher_init() {
        if (Services.vc.compare(Services.appinfo.version, "61.*") > 0) {
          return;
        }

        if (!this.tools) {
          return;
        }

        this.tools.removeAttribute("hidden");

        [].forEach.call(document.querySelectorAll("#tools > li"), li => {
          li.addEventListener("click", aEvt => {
            this.launcher.classList.toggle("tools");

            let id = aEvt.currentTarget.id;
            sendAsyncMessage("mozCNUtils:Tracking", {
              type: "tools",
              action: "click",
              sid: id
            });

            let msg = {
              "downloads": "AboutHome:Downloads",
              "bookmarks": "AboutHome:Bookmarks",
              "history": "AboutHome:History",
              "addons": "AboutHome:Addons",
              "sync": "AboutHome:Sync",
              "settings": "AboutHome:Settings"
            }[id];
            if (!msg) {
              return;
            }
            sendAsyncMessage(msg);
          }, false, /** wantsUntrusted */false);
        });

        // lazy load AboutHome.jsm on Fx 55+, see https://bugzil.la/1358921
        sendAsyncMessage("AboutHome:RequestUpdate");
      }
    };

    for (let messageObj of [NTabDB]) {
      aSubject.addEventListener(messageObj.messageName, aEvt => {
        if (aEvt.detail && aEvt.detail.dir == "content2fs") {
          sendAsyncMessage(messageObj.messageName, aEvt.detail.data);
        }
      }, true, true);
    }

    aSubject.addEventListener("DOMContentLoaded", () => {
      Launcher.init();
    });
  }
}

Services.obs.addObserver(NTab, "content-document-global-created");
