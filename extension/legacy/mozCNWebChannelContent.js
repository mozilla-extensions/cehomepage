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

let mozCNWebChannelContent = {
  specs: [
    "https://home.firefoxchina.cn/",
    "https://i.firefoxchina.cn/",
    "http://newtab.firefoxchina.cn/",
    "https://newtab.firefoxchina.cn/",
    NTabDB.spec,
  ],
  channelID: "moz_cn_channel_v2",
  messageName: "mozCNUtils:WebChannel",

  handleEvent(aEvt) {
    switch (aEvt.type) {
      case "mozCNUtils:Register":
        switch (aEvt.detail.subType) {
          case "defaultBrowser.maybeEnableSetDefaultBrowser":
            this.maybeEnableSetDefaultBrowser(aEvt);
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
        break;
    }
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
            type: "setFxAsDefaultBrowser",
          });
          button.setAttribute("hidden", "true");
        }, false, /** wantsUntrusted */false);
        button.removeAttribute("hidden");
      },
    };
    addMessageListener(this.messageName, listener);
    sendAsyncMessage(this.messageName, {
      type: messageType,
    });
  },
};
mozCNWebChannelContent.init();
