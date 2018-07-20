var EXPORTED_SYMBOLS = ["QuickDialData"];

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

let QuickDialData = {
  get variant() {
    let channel = Services.prefs.getCharPref("app.chinaedition.channel",
      "www.firefox.com.cn");

    delete this.variant;
    return this.variant = {
      "firefox.xbsafe.jiangxi-telecom": "jxtel"
    }[channel] || "master-ii";
  }
};
