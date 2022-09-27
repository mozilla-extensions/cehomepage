/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global globalThis */

var EXPORTED_SYMBOLS = ["Tracking"];

// Since Fx 104, see https://bugzil.la/1667455,1780695
const Services =
  globalThis.Services ||
  ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

let url = "http://addons.g-fox.cn/ntab.gif";
let _extend = function(src, target) {
  for (var key in src) {
    target[key] = src[key];
  }
  return target;
};

let Tracking = {
  _cachedOptions: [],
  get cid() {
    delete this.cid;
    return this.cid = Services.prefs.getCharPref("app.chinaedition.channel",
                                                 "www.firefox.com.cn");
  },

  track(option) {
    let tracker = Cc["@mozilla.com.cn/tracking;1"];
    if (!tracker) {
      this._cachedOptions.push(option);
      while (this._cachedOptions.length > 8) {
        this._cachedOptions.shift();
      }
      return;
    }

    if (!tracker.getService().wrappedJSObject.ude) {
      this._cachedOptions.length = 0;
      return;
    }

    while (this._cachedOptions.length) {
      this._track(this._cachedOptions.shift());
    }

    this._track(option);
  },

  _track(option) {
    option = _extend(option, {
      type: "",
      action: "",
      fid: "",
      sid: "",
      href: "",
      title: "",
      altBase: "",
    });

    let args = [];

    // alternative format used by newtab.firefoxchina.cn
    if (option.altBase == "http://newtab.firefoxchina.cn/img/trace.gif" ||
        option.altBase == "https://newtab.firefoxchina.cn/img/trace.gif") {
      if (!option.sid || !option.title || !option.href) {
        return;
      }

      args.push("c=" + encodeURIComponent(option.sid));
      args.push("t=" + encodeURIComponent(option.title));
      args.push("u=" + encodeURIComponent(option.href));
    } else {
      if (!option.type || !option.sid || !option.action) {
        return;
      }

      args.push("c=ntab");
      args.push("t=" + encodeURIComponent(option.type));
      args.push("a=" + encodeURIComponent(option.action));
      args.push("d=" + encodeURIComponent(option.sid));
      args.push("f=" + encodeURIComponent(option.fid));
      if (option.title) {
        args.push("ti=" + encodeURIComponent(option.title).substr(0, 200));
      }
      if (option.href) {
        args.push("hr=" + encodeURIComponent(option.href).substr(0, 200));
      }
      args.push("r=" + Math.random());
    }

    args.push("cid=" + this.cid);

    let xhr = new XMLHttpRequest();
    xhr.open("GET", ((option.altBase || url) + "?" + args.join("&")), true);
    xhr.send();
  },
};
