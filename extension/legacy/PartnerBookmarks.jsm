var EXPORTED_SYMBOLS = ["PartnerBookmarks"];

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.importGlobalProperties(["XMLHttpRequest"]);
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils",
  "resource://gre/modules/PlacesUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Tracking",
  "resource://ntab/Tracking.jsm");

let PartnerBookmarks = {
  get fisvc() {
    delete this.fisvc;
    return this.fisvc = Cc["@mozilla.org/browser/favicon-service;1"].
      getService(Ci.mozIAsyncFavicons || Ci.nsIFaviconService);
  },

  get prefs() {
    let branch = Services.prefs.getBranch("moa.partnerbookmark.");
    delete this.prefs;
    return this.prefs = branch;
  },

  get updateUrl() {
    delete this.updateUrl;
    return this.updateUrl = "https://bookmarks-ssl.firefoxchina.cn/bookmarks/updates.json";
  },

  async _fetch(url) {
    if (!url) {
      throw new Error("Cannot fetch nothing from an empty url");
    }
    let response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Got "${response.status} ${response.statusText}" for "${url}"`);
    }
    return response.json();
  },

  _setFaviconForUrl(uri, iconData) {
    let faviconUri = Services.io.newURI("fake-favicon-uri:" + uri);
    let systemPrincipal = Services.scriptSecurityManager.getSystemPrincipal();
    this.fisvc.replaceFaviconDataFromDataURL(faviconUri, iconData, 0,
      systemPrincipal);
    let newUri = Services.io.newURI(uri);
    this.fisvc.setAndFetchFaviconForPage(newUri, faviconUri, false,
      this.fisvc.FAVICON_LOAD_NON_PRIVATE, null, systemPrincipal);
  },

  async _tempFix() {
    let tempFixVersion = this.prefs.getIntPref("tempfixversion", 0);

    if (tempFixVersion >= this._tempFixVersion) {
      return;
    }

    await this._removeOrphanedKeywords();

    this.prefs.setIntPref("tempfixversion", this._tempFixVersion);
  },

  async _removeOrphanedKeywords() {
    let removals = [];
    try {
      let db = await PlacesUtils.promiseDBConnection();
      await db.execute(`SELECT keyword FROM moz_keywords AS k
        WHERE k.keyword LIKE :keyword AND
          NOT EXISTS (SELECT 1 FROM moz_bookmarks AS b JOIN moz_places AS p
                        ON b.fk = p.id WHERE p.id = k.place_id)`,
        {
          keyword: "mozcn:%"
        },
        row => {
          let keyword = row.getResultByName("keyword");
          removals.push(PlacesUtils.keywords.remove(keyword));
        }
      );
      await Promise.all(removals);
    } catch (err) {
      Cu.reportError(err);
    }
  },

  async _realUpdate(aUpdates, aSignature) {
    if (this.prefs.getCharPref("signature", "") == aSignature) {
      return;
    }

    let keywords = Object.keys(aUpdates);

    await Promise.all(keywords.map(async keyword => {
      let keywordObj = await PlacesUtils.keywords.fetch(keyword);
      if (!keywordObj) {
        return;
      }

      let item = aUpdates[keyword];
      let bookmarks = [];
      await PlacesUtils.bookmarks.fetch({
        url: keywordObj.url.href
      }, bookmark => {
        bookmarks.push(bookmark);
      });

      await Promise.all(bookmarks.map(bookmark => {
        if (item.uri) {
          bookmark.url = item.uri;
          if (item.title) {
            bookmark.title = item.title;
          }
          return PlacesUtils.bookmarks.update(bookmark);
        }
        /* an empty object could be used to remove bookmarks:
            ... "mozcn:***:***": {}, ... */
        return PlacesUtils.bookmarks.remove(bookmark);
      }));

      if (!item.uri) {
        return;
      }

      if (item.favicon) {
        this._setFaviconForUrl(item.uri, item.favicon);
      }
      await PlacesUtils.keywords.insert({
        keyword: (item.keyword || keyword),
        url: item.uri
      });
    }));
    await this._removeOrphanedKeywords();
    this.prefs.setCharPref("signature", aSignature);
  },

  async update() {
    try {
      let data = await this._fetch(this.updateUrl);
      if (!data.data || !data.signature) {
        return;
      }

      await this._realUpdate(JSON.parse(data.data), data.signature);
    } catch (ex) {
      Cu.reportError(ex);
    }
  },

  _inited: false,

  // (new Date(2018, 11, 13, 9)).getTime() / 3600e3 @ 2018-12-13T01:00:00.000Z
  _tempFixVersion: 429073,

  // nsINavBookmarkObserver
  onBeginUpdateBatch() {},
  onEndUpdateBatch() {},
  onItemAdded() {},
  onBeforeItemRemoved() {},
  onItemRemoved() {},
  onItemChanged() {},
  async onItemVisited(a, b, c, d, aURI, f, g, h) {
    let keyword = await PlacesUtils.keywords.fetch({ url: aURI.spec });
    let prefix = "mozcn:toolbar:";
    if (keyword && keyword.keyword.indexOf(prefix) == 0) {
      Tracking.track({
        type: "bookmarks",
        action: "click",
        sid: keyword.keyword.substring(prefix.length)
      });
    }
  },
  onItemMoved() {},

  async init() {
    if (this._inited) {
      return;
    }
    this._inited = true;

    await this._tempFix();
    await this.update();

    PlacesUtils.bookmarks.addObserver(this, false);
  },

  uninit() {
    PlacesUtils.bookmarks.removeObserver(this);
  }
};
