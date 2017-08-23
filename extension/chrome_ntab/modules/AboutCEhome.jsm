this.EXPORTED_SYMBOLS = ["AboutCEhome"];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

function AboutCEhome() {}
AboutCEhome.prototype = {
  classDescription: "China Edition New Home about:cehome",
  contractID: "@mozilla.org/network/protocol/about;1?what=cehome",
  classID: Components.ID("c0a76f7d-8214-4476-afe3-b34f9051cb99"),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),

  getURIFlags(uri) {
    return Ci.nsIAboutModule.ALLOW_SCRIPT;
  },

  newChannel(uri, loadInfo) {
    var home = "chrome://cehomepage/content/aboutHome.xul";
    var newUri = Services.io.newURI(home);
    var channel = Services.io.newChannelFromURIWithLoadInfo(newUri, loadInfo);
    channel.originalURI = uri;
    return channel;
  }
};
