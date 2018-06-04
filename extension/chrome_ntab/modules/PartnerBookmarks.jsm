var EXPORTED_SYMBOLS = ["PartnerBookmarks"];

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.importGlobalProperties(["XMLHttpRequest"]);
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils",
  "resource://gre/modules/PlacesUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SignatureVerifier",
  "resource://ntab/mozCNUtils.jsm");
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
    return this.updateUrl = "http://bookmarks.firefoxchina.cn/bookmarks/updates.json";
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

  _tempFix() {
    let tempFixVersion = this.prefs.getIntPref("tempfixversion", 0);

    if (tempFixVersion >= this._tempFixVersion) {
      return Promise.resolve();
    }

    if (Date.now() >= this._tempFixVersion * 3600e3) {
      return this._removeOrphanedKeywords().then(() => {
        this.prefs.setIntPref("tempfixversion", this._tempFixVersion);
      });
    }

    let keyword = "mozcn:toolbar:jd18jun";
    let item = {
      favicon: "data:image/x-icon;base64,AAABAAEAEBAQAAEABAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiFcgAMCTLAD4yzwBLQdIAWVDWAGde2QB1bd0AkYrkAJ6Z5wCsp+oAurbuAOPi+ADx8PwA////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABNyRDd3aQAABWdkNlHvVAAAArA1wAbsAAAB9DXAAbTAAAH0NcABNQAAAfQ1wAF1AAAB9DXAArQAAAH0NcDrYAAAAfQ3d3HAAAAAkBERBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      indexNoRef: 4,
      indexRefs: ["mozcn:toolbar:jd", "mozcn:toolbar:taobao"],
      parent: PlacesUtils.bookmarks.toolbarFolder,
      parentGuid: PlacesUtils.bookmarks.toolbarGuid,
      title: "\u4eac\u4e1c\u5546\u57ce",
      uri: "https://union-click.jd.com/jdc?e=0&p=AyIEVB9rFDITNxFEA0tdIl4QXhoeHAxFBUYPCllHGAdFBwtSQEJLcitMV1pFIEVedB1LQglGVVFdSlkKawlQekcLVxpdEwQiUDZzIm1ebX8wZwtLWkh4K3oMVwphd1kXNRYDEg5JGl8JABIWVR9QEQcZBFQrWBYDFgdcGVgTMhEEVB9YFAAbAmUrWxQyWWlUK14VABoCVRtcEDISA1YdXREAEQBUElIXMhU3KUUQTV9PV1YaWxAyIgVUHV0TMiI3ZRtcJQE%3D&t=W1dCFBBFC0BCWgEEAEAdQFkJBQtHRwxuJUIOXUBnWVB6RExHTlpbXwRNXE13B14jQA4QBlMdXQ%3D%3D"
    };

    let bookmarks = [],
        existedJD = false,
        refIndex = -Infinity;
    return PlacesUtils.promiseDBConnection().then(db => {
      return db.execute(`SELECT b.title AS title, p.url AS url
        FROM moz_bookmarks AS b JOIN moz_places AS p ON b.fk = p.id
        WHERE b.parent = :parent_id AND p.url LIKE :taobao_url
        LIMIT 1;`,
        {
          parent_id: item.parent,
          taobao_url: "%.jd.com/%"
        }
      );
    }).then(rows => {
      existedJD = !!rows.length;

      return PlacesUtils.keywords.fetch(keyword);
    }).then(keywordObj => {
      if (!keywordObj) {
        return Promise.resolve();
      }

      return PlacesUtils.bookmarks.fetch({
        url: keywordObj.url.href
      }, bookmark => bookmarks.push(bookmark));
    }).then(() => {
      return Promise.all(item.indexRefs.map(indexRef => {
        return PlacesUtils.keywords.fetch(indexRef);
      }));
    }).then(refKeywordObjs => {
      let refKeywordObj;
      while (!refKeywordObj && refKeywordObjs.length) {
        refKeywordObj = refKeywordObjs.shift();
      }
      if (!refKeywordObj) {
        return Promise.resolve();
      }

      return PlacesUtils.bookmarks.fetch({
        url: refKeywordObj.url.href
      }, bookmark => {
        if (bookmark.parentGuid !== item.parentGuid) {
          return;
        }
        refIndex = Math.max(bookmark.index, refIndex);
        if (refKeywordObj.keyword === "mozcn:toolbar:jd") {
          existedJD = true;
        }
      });
    }).then(() => {
      let index = refIndex === -Infinity ? item.indexNoRef : (refIndex + 1);

      if (bookmarks.filter(bookmark => {
        return bookmark.parentGuid === item.parentGuid;
      }).length || existedJD) {
        return Promise.resolve();
      }

      return PlacesUtils.bookmarks.insert({
        parentGuid: item.parentGuid,
        index,
        title: item.title,
        url: item.uri
      });
    }).then(() => {
      return Promise.all(bookmarks.map(bookmark => {
        bookmark.url = item.uri;
        if (item.title) {
          bookmark.title = item.title;
        }
        return PlacesUtils.bookmarks.update(bookmark);
      }));
    }).then(() => {
      if (item.favicon) {
        this._setFaviconForUrl(item.uri, item.favicon);
      }

      return PlacesUtils.keywords.insert({
        keyword,
        url: item.uri
      });
    }).then(() => {
      return this._removeOrphanedKeywords();
    }).then(() => {
      this.prefs.setIntPref("tempfixversion", this._tempFixVersion);
    });
  },

  _removeOrphanedKeywords() {
    let removals = [];
    return PlacesUtils.promiseDBConnection().then(db => {
      return db.execute(`SELECT keyword FROM moz_keywords AS k
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
    }).then(() => {
      return Promise.all(removals);
    }, err => {
      Cu.reportError(err);
    });
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
      if (SignatureVerifier.verify(aData.data, aData.signature)) {
        this._realUpdate(JSON.parse(aData.data), aData.signature);
      }
    });
  },

  _inited: false,

  // (new Date(2018, 5, 19, 9)).getTime() / 3600e3 @ 2018-06-19T01:00:00.000Z
  _tempFixVersion: 424825,

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
