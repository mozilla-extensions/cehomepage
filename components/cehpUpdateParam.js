const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function collectPref() {
  let prefs = Services.prefs.getBranch("moa.ntab.");
  let ret = [];

  try {
    ret.push(prefs.getCharPref("view"));
    ret.push(prefs.getCharPref("qdtab"));
    ret.push(prefs.getBoolPref("qdtab.used"));

    let col = prefs.getIntPref("dial.column");
    let row = prefs.getIntPref("dial.row");
    ret.push([col, row].join(","));

    let bgimage = prefs.prefHasUserValue("backgroundimage");
    let bgcolor = encodeURIComponent(prefs.getCharPref("backgroundcolor"));
    let bgimagestyle = prefs.getCharPref("backgroundimagestyle");
    ret.push(bgimage ? bgimagestyle : bgcolor);

    ret.push(prefs.getIntPref("dial.extrawidth"));
    ret.push(prefs.getBoolPref("dial.useopacity"));

    let dialModified = 0;
    Cu.import("resource://ntab/quickdial.jsm");
    for (var i = 1; i <= 8; i++) {
      let dial = quickDialModule.getDial(i);
      if (dial && dial.defaultposition && dial.defaultposition.indexOf(i) == 0) {
        dialModified = dialModified | (1 << (8 - i));
      }
    }
    ret.push(dialModified.toString(2));

    let bookmarksToCheck = {
      "http://s.click.taobao.com/t?e=zGU34CA7K%2BPkqB05%2Bm7rfGGjlY60oHcc7bkKOQYmIX0uNLK1pwv%2BifTaqFIrn1w%2FakplTBnP3D56LgXgufuIPG%2FcBYvSdiC2vkuCKsBVr8VLhdXwLQ%3D%3D": "tmall2",
      "http://www.taobao.com/go/chn/tbk_channel/onsale.php?pid=mm_28347190_2425761_13730658&eventid=101329": "taobao"
    };
    let bookmarksExisted = [];
    for (let url in bookmarksToCheck) {
      let uri = Services.io.newURI(url, null, null);
      if (PlacesUtils.bookmarks.getBookmarkIdsForURI(uri, {}).length) {
        bookmarksExisted.push(bookmarksToCheck[url]);
      }
    }
    ret.push(bookmarksExisted.join(",") || "false");
  } catch(e) {}

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
      case "CEHP_PREF_TRACKING":
        return collectPref();
      default:
        return "NotSupported";
    }
  }
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([CehpUpdateParams]);
