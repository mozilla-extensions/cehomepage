const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function collectPref() {
  let prefs = Services.prefs.getBranch("moa.ntab.");
  let ret = [];
  ret.push(prefs.getCharPref("view"));
  ret.push(prefs.getCharPref("qdtab"));
  ret.push(prefs.getBoolPref("qdtab.used"));

  let thumbSize = prefs.getCharPref("dial.thumbsize");
  let col = prefs.getIntPref("dial.column");
  let row = prefs.getIntPref("dial.row");
  ret.push(thumbSize ? [thumbSize, col, row].join(",") : "default");

  let bgimage = prefs.prefHasUserValue("backgroundimage");
  let bgcolor = prefs.getCharPref("backgroundcolor");
  ret.push(bgimage ? "image" : bgcolor);

  return ret.join("|");
}

function CehpUpdateParams() {
}

CehpUpdateParams.prototype = {
  classDescription: "CEHP Update Params",
  classID: Components.ID("{eac198fa-e173-4274-8fb3-5857c6a52d10}"),
  contractID: "@mozillaonline.com/cehp-update-params;1",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIPropertyBag2]),

  getPropertyAsAString: function(param) {
    switch(param) {
      case "PREF_TRACKING":
        return collectPref();
      default:
        return "NotSupported";
    }
  }
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([CehpUpdateParams]);
