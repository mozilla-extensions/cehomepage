this.EXPORTED_SYMBOLS = ["AboutCEhome"];

ChromeUtils.defineModuleGetter(this, "XPCOMUtils",
  "resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  "Homepage": "resource://ntab/mozCNUtils.jsm", /* global Homepage */
  "Services": "resource://gre/modules/Services.jsm" /* global Services */
});
XPCOMUtils.defineLazyGetter(this, "generateQI", () => {
  // ChromeUtils one introduced in Fx 61, mandatory in https://bugzil.la/1484466
  return XPCOMUtils.generateQI ?
    XPCOMUtils.generateQI.bind(XPCOMUtils) :
    ChromeUtils.generateQI.bind(ChromeUtils);
});

function AboutCEhome() {}
AboutCEhome.prototype = {
  classDescription: "China Edition New Home about:cehome",
  contractID: "@mozilla.org/network/protocol/about;1?what=cehome",
  classID: Components.ID("c0a76f7d-8214-4476-afe3-b34f9051cb99"),
  QueryInterface: generateQI([Ci.nsIAboutModule]),

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
  }
};
