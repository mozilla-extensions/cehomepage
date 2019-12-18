this.EXPORTED_SYMBOLS = ["AboutCEhome"];

ChromeUtils.defineModuleGetter(this, "XPCOMUtils",
  "resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  Homepage: "resource://ntab/mozCNUtils.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

function AboutCEhome() {}
AboutCEhome.prototype = {
  classDescription: "China Edition New Home about:cehome",
  contractID: "@mozilla.org/network/protocol/about;1?what=cehome",
  classID: Components.ID("c0a76f7d-8214-4476-afe3-b34f9051cb99"),
  QueryInterface: ChromeUtils.generateQI([Ci.nsIAboutModule]),

  getURIFlags(uri) {
    return (Ci.nsIAboutModule.ALLOW_SCRIPT |
            Ci.nsIAboutModule.HIDE_FROM_ABOUTABOUT);
  },

  newChannel(uri, loadInfo) {
    var newUri = Services.io.newURI(Homepage.aboutpage);
    var channel = Services.io.newChannelFromURIWithLoadInfo(newUri, loadInfo);
    channel.originalURI = uri;
    loadInfo.resultPrincipalURI = newUri;
    return channel;
  },
};
