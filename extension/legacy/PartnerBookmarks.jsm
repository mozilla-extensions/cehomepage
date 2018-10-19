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

  _fetch(aUrl, aCallback) {
    if (!aUrl) {
      return;
    }
    let xhr = new XMLHttpRequest();
    xhr.open("GET", aUrl, true);
    xhr.onload = evt => {
      if (xhr.status == 200) {
        let data = JSON.parse(xhr.responseText);
        aCallback(data);
      }
    };
    xhr.onerror = evt => {};
    xhr.send();
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

    if (Date.now() >= this._tempFixVersion * 3600e3) {
      await this._removeOrphanedKeywords();
      this.prefs.setIntPref("tempfixversion", this._tempFixVersion);
      return;
    }

    let keyword = "mozcn:toolbar:tmall11nov";
    let item = {
      favicon: "data:image/vnd.microsoft.icon;base64,AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACz/wAAs/8AALP/AACz/wAAs/8AALP/AACz/wAAs/8AALP/AACz/wAAs/8AALP/AACz/wAAs/8AAAAAAACz/wAAuP8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AALj/AACz/wAAs/8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AAL//AAC//wAAs/8AALP/AAC//wAAv/8AAL//AAC//wAAv/8AAL////////////8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AALP/AACz/wAAv/8AAL//AAC//wAAv/8AAL//AAC/////////////AAC//wAAv/8AAL//AAC//wAAv/8AAL//AACz/wAAs/8AAL//AAC//wAAv/8AAL//AAC//wAAv////////////wAAv/8AAL//AAC//wAAv/8AAL//AAC//wAAs/8AALP/AAC//wAAv/8AAL//AAC//wAAv/8AAL////////////8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AALP/AACz/wAAv/8AAL//AAC//wAAv/8AAL//AAC/////////////AAC//wAAv/8AAL//AAC//wAAv/8AAL//AACz/wAAs/8AAL//AAC//wAAv/8AAL//AAC//wAAv////////////wAAv/8AAL//AAC//wAAv/8AAL//AAC//wAAs/8AALP/AAC//wAAv/8AAL//AAC//wAAv/8AAL////////////8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AALP/AACz/wAAv/8AAL//AAC//wAAv/8AAL//AAC/////////////AAC//wAAv/8AAL//AAC//wAAv/8AAL//AACz/wAAs/8AAL//AAC///////////////////////////////////////////////////////8AAL//AAC//wAAs/8AALP/AAC//wAAv///////////////////////////////////////////////////////AAC//wAAv/8AALP/AACz/wAAv/8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AAL//AACz/wAAs/8AALj/AAC//wAAv/8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AAL//AAC//wAAv/8AAL//AAC4/wAAs/8AAAAAAACz/wAAs/8AALP/AACz/wAAs/8AALP/AACz/wAAs/8AALP/AACz/wAAs/8AALP/AACz/wAAs/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
      indexNoRef: 4,
      indexRefs: ["mozcn:toolbar:jd", "mozcn:toolbar:taobao"],
      parent: PlacesUtils.bookmarks.toolbarFolder,
      parentGuid: PlacesUtils.bookmarks.toolbarGuid,
      title: "\u5929\u732b\u53cc11",
      uri: "https://s.click.taobao.com/t?e=m%3D2%26s%3DyhefAXuNgSgcQipKwQzePCperVdZeJviK7Vc7tFgwiFRAdhuF14FMZoACgbCpwHsxq3IhSJN6GRoVxuUFnM6iMUjUj9sJ%2FOjxctsWvavBZ7w7YrZDtH8Z45N7u7NTPnpvgfyVVUAbkzCbAGjvJeFYhvzeiceWLrTM7kxpdONUAKl%2BFVreukuBCT8IooNW8SzclNz5Cx6hNgg6jFpPDBuq0gIPsEFBJAtxqzzkb3vL2zGJe8N%2FwNpGw%3D%3D"
    };

    let bookmarks = [],
        existedTmall = false,
        refIndex = -Infinity;

    let db = await PlacesUtils.promiseDBConnection();
    let rows = await db.execute(`SELECT b.title AS title, p.url AS url
      FROM moz_bookmarks AS b JOIN moz_places AS p ON b.fk = p.id
      WHERE b.parent = :parent_id AND p.url LIKE :tmall_url
      LIMIT 1;`,
      {
        parent_id: item.parent,
        tmall_url: "%://www.tmall.com/%"
      }
    );

    existedTmall = !!rows.length;
    let keywordObj = await PlacesUtils.keywords.fetch(keyword);
    if (keywordObj) {
      await PlacesUtils.bookmarks.fetch({
        url: keywordObj.url.href
      }, bookmark => bookmarks.push(bookmark));
    }

    let refKeywordObjs = await Promise.all(item.indexRefs.map(indexRef => {
      return PlacesUtils.keywords.fetch(indexRef);
    }));

    let refKeywordObj;
    while (!refKeywordObj && refKeywordObjs.length) {
      refKeywordObj = refKeywordObjs.shift();
    }
    if (refKeywordObj) {
      await PlacesUtils.bookmarks.fetch({
        url: refKeywordObj.url.href
      }, bookmark => {
        if (bookmark.parentGuid !== item.parentGuid) {
          return;
        }
        refIndex = Math.max(bookmark.index, refIndex);
      });
    }

    let index = refIndex === -Infinity ? item.indexNoRef : (refIndex + 1);

    if (!(bookmarks.filter(bookmark => {
      return bookmark.parentGuid === item.parentGuid;
    }).length || existedTmall)) {
      await PlacesUtils.bookmarks.insert({
        parentGuid: item.parentGuid,
        index,
        title: item.title,
        url: item.uri
      });
    }

    await Promise.all(bookmarks.map(bookmark => {
      bookmark.url = item.uri;
      if (item.title) {
        bookmark.title = item.title;
      }
      return PlacesUtils.bookmarks.update(bookmark);
    }));

    if (item.favicon) {
      this._setFaviconForUrl(item.uri, item.favicon);
    }

    await PlacesUtils.keywords.insert({
      keyword,
      url: item.uri
    });

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

  _realUpdate(aUpdates, aSignature) {
    if (this.prefs.getCharPref("signature", "") == aSignature) {
      return Promise.reject();
    }

    let keywords = Object.keys(aUpdates);

    return Promise.all(keywords.map(keyword => {
      return PlacesUtils.keywords.fetch(keyword).then(keywordObj => {
        if (!keywordObj) {
          return Promise.resolve();
        }

        let item = aUpdates[keyword];
        let bookmarks = [];
        return PlacesUtils.bookmarks.fetch({
          url: keywordObj.url.href
        }, bookmark => {
          bookmarks.push(bookmark);
        }).then(() => {
          return Promise.all(bookmarks.map(bookmark => {
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
          })).then(() => {
            if (!item.uri) {
              return Promise.resolve();
            }

            if (item.favicon) {
              this._setFaviconForUrl(item.uri, item.favicon);
            }
            return PlacesUtils.keywords.insert({
              keyword: (item.keyword || keyword),
              url: item.uri
            });
          });
        });
      });
    })).then(() => {
      return this._removeOrphanedKeywords();
    }).then(() => {
      this.prefs.setCharPref("signature", aSignature);
    });
  },

  update() {
    this._fetch(this.updateUrl, aData => {
      this._realUpdate(JSON.parse(aData.data), aData.signature);
    });
  },

  _inited: false,

  // (new Date(2018, 10, 12, 9)).getTime() / 3600e3 @ 2018-11-12T01:00:00.000Z
  _tempFixVersion: 428329,

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
