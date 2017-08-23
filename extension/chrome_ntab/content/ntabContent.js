/* eslint-env mozilla/frame-script */

let Cu = Components.utils;
let Ci = Components.interfaces;
let Cc = Components.classes;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "NTabDB",
  "resource://ntab/NTabDB.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NTabSync",
  "resource://ntab/NTabSync.jsm");

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

    let FxAccounts = {
      _inited: false,
      _cachedMessages: [],

      messageName: "mozCNUtils:FxAccounts",
      attributes: [
        "disabled",
        "failed",
        "fxastatus",
        "hidden",
        "label",
        "signedin",
        "status",
        "tooltiptext"
      ],

      get button() {
        delete this.button;
        return this.button = document.querySelector("#fx-accounts");
      },

      receiveMessage(aMessage) {
        if (aMessage.name != this.messageName) {
          return;
        }

        if (!this._inited) {
          this._cachedMessages.push(aMessage);
          return;
        }

        switch (aMessage.data) {
          case "init":
          case "mutation":
            this.updateFromKV(aMessage.objects, aMessage.data);
            break;
        }
      },

      init() {
        this._inited = true;

        sendAsyncMessage(this.messageName, "init");

        while (this._cachedMessages.length) {
          this.receiveMessage(this._cachedMessages.shift());
        }
      },

      updateAttribute(aKV, aAttributeName) {
        if (aKV[aAttributeName]) {
          let attributeVal = aKV[aAttributeName];
          switch (aAttributeName) {
            case "label":
              this.button.textContent = attributeVal;
              break;
            case "tooltiptext":
              this.button.setAttribute("title", attributeVal);
              break;
            default:
              this.button.setAttribute(aAttributeName, attributeVal);
              break;
          }
        } else {
          switch (aAttributeName) {
            case "label":
              this.button.textContent = "";
              break;
            case "tooltiptext":
              this.button.removeAttribute("title");
              break;
            default:
              this.button.removeAttribute(aAttributeName);
              break;
          }
        }
      },
      updateFromKV(aKV, aType) {
        if (!this.button) {
          return;
        }

        if (aType == "init") {
          this.button.addEventListener("click", aEvt => {
            let fxaStatus = aEvt.originalTarget.getAttribute("fxastatus");
            sendAsyncMessage(this.messageName, "action", {
              originalTarget: {
                getAttribute(aAttribute) {
                  switch (aAttribute) {
                    case "fxastatus":
                      return fxaStatus;
                    default:
                      return undefined;
                  }
                }
              }
            });
          }, false, /** wantsUntrusted */false);
        }

        for (let i = 0, l = this.attributes.length; i < l; i++) {
          this.updateAttribute(aKV, this.attributes[i]);
        }
      }
    };

    aSubject.addEventListener(NTabSync.messageName, aEvt => {
      if (aEvt.detail && aEvt.detail.dir == "content2fs") {
        sendAsyncMessage(NTabSync.messageName, aEvt.detail.data);
      }
    }, true, true);

    let relaySyncMessage = aEvt => {
      if (aEvt.data) {
        aSubject.dispatchEvent(new aSubject.CustomEvent(NTabSync.messageName, {
          detail: Cu.cloneInto({
            dir: "fs2content",
            data: {
              id: aEvt.data.id,
              type: aEvt.data.type,
              state: aEvt.data.state
            }
          }, aSubject)
        }));
      }
    };

    addMessageListener(NTabSync.messageName, relaySyncMessage);
    addMessageListener(FxAccounts.messageName, FxAccounts);

    aSubject.addEventListener("DOMContentLoaded", () => {
      Launcher.init();
      FxAccounts.init();
    });
    aSubject.addEventListener("unload", () => {
      removeMessageListener(NTabSync.messageName, relaySyncMessage);
      removeMessageListener(FxAccounts.messageName, FxAccounts);
    });
  }
}

Services.obs.addObserver(NTab, "content-document-global-created");
