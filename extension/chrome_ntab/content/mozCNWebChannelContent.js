/* eslint-env mozilla/frame-script */

let {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "NTabDB",
  "resource://ntab/NTabDB.jsm");

let mozCNWebChannelContent = {
  specs: [
    "http://e.firefoxchina.cn/",
    "http://home.firefoxchina.cn/",
    "http://i.firefoxchina.cn/",
    "http://n.firefoxchina.cn/",
    "http://newtab.firefoxchina.cn/",
    NTabDB.spec
  ],
  cachedWindows: new Map(),
  channelID: "moz_cn_channel_v2",
  messageName: "mozCNUtils:WebChannel",

  handleEvent(aEvt) {
    switch (aEvt.type) {
      case "mozCNUtils:Register":
        switch (aEvt.detail.subType) {
          case "defaultBrowser.maybeEnableSetDefaultBrowser":
            this.maybeEnableSetDefaultBrowser(aEvt);
            break;
          case "searchEngine.maybeEnableSwitchToBaidu":
            this.maybeEnableSwitchToBaidu(aEvt);
            break;
          /* tools ? */
        }
        break;
    }
  },

  init() {
    Services.obs.addObserver(this, "content-document-global-created");
    addEventListener("unload", () => {
      Services.obs.removeObserver(this, "content-document-global-created");
    });

    // relay WebChannel response to qualified inner windows
    addEventListener("WebChannelMessageToContent", aEvt => {
      if (aEvt.target !== content) {
        return;
      }

      this.cachedWindows.forEach(aWindow => {
        try {
          let evt = new aWindow.CustomEvent("WebChannelMessageToContent", {
            detail: Cu.cloneInto(aEvt.detail, aWindow),
          });
          aWindow.dispatchEvent(evt);
        } catch (e) {}
      });
    }, true, true);
  },

  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "content-document-global-created":
        if (!content || !aSubject || aSubject.top !== content) {
          return;
        }

        if (!this.specs.some(aSpec => {
          return Services.io.newURI(aSpec).prePath === aData;
        })) {
          return;
        }

        aSubject.wrappedJSObject.mozCNChannel = this.channelID;
        aSubject.addEventListener("mozCNUtils:Register", this, true, true);
        if (aSubject.top === aSubject) {
          return;
        }

        let innerID = aSubject.QueryInterface(Ci.nsIInterfaceRequestor).
          getInterface(Ci.nsIDOMWindowUtils).currentInnerWindowID;
        aSubject.addEventListener("unload", aEvt => {
          this.cachedWindows.delete(innerID);
        });

        this.cachedWindows.set(innerID, aSubject);
        break;
    }
  },

  isElementVisible(aElement) {
    if (aElement.hidden) {
      return false;
    }
    let style = aElement.style;
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    let rect = aElement.getBoundingClientRect();
    if (!rect.height || !rect.width) {
      return false;
    }
    return true;
  },

  maybeEnableSetDefaultBrowser(aEvt) {
    if (aEvt.target.document.documentURI !== NTabDB.spec) {
      return;
    }

    let self = this;
    let messageType = "isFxDefaultBrowser";
    let listener = {
      receiveMessage(msg) {
        let data = msg.data || {};
        if (data.type !== messageType) {
          return;
        }
        removeMessageListener(msg.name, listener);

        /* undefined: no shellService,
           true: is default,
           false: is not default */
        if (data.data !== false) {
          return;
        }
        let { button } = aEvt.detail.elements;
        button.addEventListener("click", () => {
          sendAsyncMessage(self.messageName, {
            type: "setFxAsDefaultBrowser"
          });
          button.setAttribute("hidden", "true");
        }, false, /** wantsUntrusted */false);
        button.removeAttribute("hidden");
      }
    };
    addMessageListener(this.messageName, listener);
    sendAsyncMessage(this.messageName, {
      type: messageType
    });
  },

  maybeEnableSwitchToBaidu(aEvt) {
    if (!aEvt.target.top.document.documentURI.startsWith("about:neterror")) {
      return;
    }

    let { form, text, check } = aEvt.detail.elements;
    let checkbox = check &&
      check.querySelector('input[type="checkbox"]');
    if (!form || !text || !checkbox) {
      return;
    }

    let self = this;
    let messageType = "isBaiduCurrentSearch";
    let listener = {
      receiveMessage(msg) {
        let data = msg.data || {};
        if (data.type !== messageType) {
          return;
        }
        removeMessageListener(msg.name, listener);
        text.value = data.data.searchText;
        if (data.data.isCurrent) {
          return;
        }
        if (!data.data.exists) {
          return;
        }
        check.hidden = false;
        form.addEventListener("submit", () => {
          if (self.isElementVisible(check) && checkbox.checked) {
            sendAsyncMessage(self.messageName, {
              type: "setBaiduAsCurrentSearch"
            });
          }
        }, false, /** wantsUntrusted */false);
      }
    };
    addMessageListener(this.messageName, listener);
    sendAsyncMessage(this.messageName, {
      type: messageType
    });
  }
};
mozCNWebChannelContent.init();
