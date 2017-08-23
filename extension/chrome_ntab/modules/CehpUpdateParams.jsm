this.EXPORTED_SYMBOLS = ["CehpUpdateParams"];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NTabDB",
  "resource://ntab/NTabDB.jsm");

function CehpUpdateParams() {}
CehpUpdateParams.prototype = {
  classDescription: "CEHP Update Params",
  classID: Components.ID("{eac198fa-e173-4274-8fb3-5857c6a52d10}"),
  contractID: "@mozillaonline.com/cehp-update-params;1",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIPropertyBag2]),
  _xpcom_categories: [{
    category: "extension-update-params",
    entry: "CEHP_PREF_TRACKING"
  }],

  getPropertyAsAString(param) {
    switch (param) {
      case "CEHP_PREF_TRACKING":
        let tracker = Cc["@mozilla.com.cn/tracking;1"];
        if (!tracker || !tracker.getService().wrappedJSObject.ude) {
          return "";
        }

        let ret = [];

        try {
          ret.push(NTabDB.getPref("moa.ntab.view", "quickdial"));
          ret.push(NTabDB.getPref("moa.ntab.qdtab", "grid"));
          ret.push(NTabDB.getPref("moa.ntab.qdtab.used", false));

          let col = NTabDB.getPref("moa.ntab.dial.column", 4);
          let row = NTabDB.getPref("moa.ntab.dial.row", 2);
          ret.push([col, row].join(","));

          // bgimage will require async indexedDB
          let bgcolor = NTabDB.getPref("moa.ntab.backgroundcolor", "transparent");
          ret.push(encodeURIComponent(bgcolor));

          // moa.ntab.dial.extrawidth not supported any more
          ret.push("NA");
          ret.push(NTabDB.getPref("moa.ntab.dial.useopacity", false));

          // dialModified will require async indexedDB
          ret.push("NA");

          // Since Fx 53, https://bugzil.la/1329926
          ret.push("NA");

          // useHotKey not supported any more
          ret.push("NA");

          ret.push(Services.prefs.getBoolPref("services.sync.engine.mozcn.ntab"));
        } catch (e) {}

        return ret.join("|");
      default:
        return "NotSupported";
    }
  }
};
