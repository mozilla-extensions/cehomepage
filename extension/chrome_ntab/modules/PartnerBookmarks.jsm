var EXPORTED_SYMBOLS = ["PartnerBookmarks"];

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
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
    let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
                .createInstance(Ci.nsIXMLHttpRequest);
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

    let keyword = "mozcn:toolbar:taobao12dec";
    let item = {
      favicon: "data:image/x-icon;base64,AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAQAQAAAAAAAAAAAAAAAAAAAAAAAD///8A////AP///wD///8AL2n//////wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AC9p//8PTOv/////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wCrw///D0zr/w9M6/8vaf//L2n//w9M6/8PTOv/D0zr/w9M6/8PTOv/D0zr/w9M6/8PTOv/q8P//////wCrw///D0zr/y9p//8vaf//L2n//y9p//8vaf//L2n//y9p//8vaf//L2n//y9p//8vaf//L2n//w9M6/+rw///VoX/////////////L2n//y9p//8vaf//L2n//y9p//8vaf//////////////////mLX//y9p//8vaf//D0zr/1aF//////////////////8vaf//mLX//////////////////y9p//8vaf////////////+Ytf//L2n//w9M6/9Whf//L2n/////////////NG3///////80bf///////////////////////zRt/////////////y9p//8PTOv/VoX//y9p//8vaf///////zRt////////NG3/////////////NG3///////80bf////////////8vaf//D0zr/1aF//8vaf//L2n//5i1////////NG3//zRt/////////////zRt//80bf//NG3/////////////L2n//w9M6/9Whf//L2n//y9p//+Ytf///////////////////////////////////////zRt/////////////y9p//8PTOv/VoX//y9p/////////////zRt////////NG3/////////////NG3//zRt//80bf////////////8vaf//D0zr/1aF//8vaf////////////80bf//NG3/////////////////////////////NG3/////////////L2n//w9M6/9Whf//L2n//zRt//80bf///////5i1/////////////zRt//80bf//NG3//zRt////////mLX//y9p//8PTOv/VoX//y9p///+/////////zRt/////////////zRt////////////////////////mLX//zRt//8vaf//D0zr/6vD//9Whf////////////8vaf////////////8vaf//L2n//y9p//8vaf//L2n//y9p//8vaf//D0zr/6vD//////8Aq8P//1aF//9Whf//VoX//1aF//9Whf//VoX//1aF//9Whf//VoX//1aF//9Whf//VoX//6vD//////8A9/8AAPP/AACAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAEAAA==",
      indexNoRef: 4,
      indexRefs: ["mozcn:toolbar:jd", "mozcn:toolbar:taobao"],
      parent: PlacesUtils.bookmarks.toolbarFolder,
      parentGuid: PlacesUtils.bookmarks.toolbarGuid,
      title: "\u6dd8\u5b9d\u53cc12",
      uri: "https://s.click.taobao.com/t?e=m%3D2%26s%3Df8vLQcOAWhocQipKwQzePCperVdZeJviLKpWJ%2Bin0XJRAdhuF14FMR9SlVySztXtt4hWD5k2kjNoVxuUFnM6iMUjUj9sJ%2FOjkPiKwSWyD2b8vekcD5j4y7g5kJpUiIWcbYbSbVjnPd6R4ypTBJBwtPIcvT56TvpnKVffChNb96kj5Wjhls5eJJS%2FcpExAJKPTwAnJWYgnPOz0Kuxa%2FSyLzswgKXcgFZoWgA%2BQG1dDD9KpYRe9tCvIiDZAKM5y9ZBPCyO7cq7mNLC7%2FyUdmIAsCY%2FoZky3xlWI0bpCN0xrCsqYvIiZ9rJj9sgJQzIf8JmZgwGFHYUhQkrUIYZs4Z%2BL7%2BBeRqigPBtTlT4SLzYDiDjspCf5GG3biGFCzYOOqAQ"
    };

    let bookmarks = [],
        existedTaobao = false,
        refIndex = -Infinity;
    return PlacesUtils.promiseDBConnection().then(db => {
      return db.execute(`SELECT b.title AS title, p.url AS url
        FROM moz_bookmarks AS b JOIN moz_places AS p ON b.fk = p.id
        WHERE b.parent = :parent_id AND p.url LIKE :taobao_url
        LIMIT 1;`,
        {
          parent_id: item.parent,
          taobao_url: "%://www.taobao.com/%"
        }
      );
    }).then(rows => {
      existedTaobao = !!rows.length;

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
      });
    }).then(() => {
      let index = refIndex === -Infinity ? item.indexNoRef : (refIndex + 1);

      if (bookmarks.filter(bookmark => {
        return bookmark.parentGuid === item.parentGuid;
      }).length || existedTaobao) {
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

  // (new Date(2017, 11, 13, 9)).getTime() / 3600e3 @ 2017-12-13T01:00:00.000Z
  _tempFixVersion: 420313,

  // nsINavBookmarkObserver
  onBeginUpdateBatch() {},
  onEndUpdateBatch() {},
  onItemAdded() {},
  onBeforeItemRemoved() {},
  onItemRemoved() {},
  onItemChanged() {},
  onItemVisited(aItemId, b, c, d, aURI, f, g, h) {
    let keyword = PlacesUtils.bookmarks.getKeywordForBookmark(aItemId);
    let prefix = "mozcn:toolbar:";
    if (keyword && keyword.indexOf(prefix) == 0) {
      Tracking.track({
        type: "bookmarks",
        action: "click",
        sid: keyword.substring(prefix.length)
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
