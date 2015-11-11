var EXPORTED_SYMBOLS = ['PartnerBookmarks'];

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
    return this.fisvc = Cc['@mozilla.org/browser/favicon-service;1'].
      getService(Ci.mozIAsyncFavicons || Ci.nsIFaviconService);
  },

  get prefs() {
    let branch = Services.prefs.getBranch('moa.partnerbookmark.');
    delete this.prefs;
    return this.prefs = branch;
  },

  get updateUrl() {
    delete this.updateUrl;
    return this.updateUrl = 'http://bookmarks.firefoxchina.cn/bookmarks/updates.json';
  },

  _getCharPref: function(aPrefKey, aDefault) {
    let ret = aDefault;
    try {
      ret = this.prefs.getCharPref(aPrefKey);
    } catch(e) {}
    return ret;
  },

  _fetch: function(aUrl, aCallback) {
    if (!aUrl) {
      return;
    }
    let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
                .createInstance(Ci.nsIXMLHttpRequest);
    xhr.open('GET', aUrl, true);
    xhr.onload = function(evt) {
      if (xhr.status == 200) {
        let data = JSON.parse(xhr.responseText);
        aCallback(data);
      }
    };
    xhr.onerror = function(evt) {};
    xhr.send();
  },

  _keywordsForBookmarks: {
    // batch #1
    // predefined (excluding those w/o querystrings?)
    'http://www.baidu.com/index.php?tn=monline_5_dg': 'mozcn:baidu:home',
    'http://www.vancl.com/?source=mozilla': 'mozcn:vancl:home',
    'http://r.union.meituan.com/url/visit/?a=1&key=yKmOefsJ5QiYS98RvpLzMN2qxT7BFhr4&url=http://www.meituan.com': 'mozcn:meituan:union',
    'http://www.hao123.com/?tn=12092018_12_hao_pg': 'mozcn:hao123:home',
    'http://youxi.baidu.com/yxpm/pm.jsp?pid=11016500091_877110': 'mozcn:baidu:youxi',

    // jd
    'http://click.union.360buy.com/JdClick/?unionId=206&siteId=1&to=http://www.360buy.com/': 'mozcn:jd:union',
    'http://click.union.360buy.com/JdClick/?unionId=316&siteId=21946&to=http://www.360buy.com': 'mozcn:jd:union',
    'http://click.union.360buy.com/JdClick/?unionId=20&siteId=439040_test_&to=http://www.360buy.com': 'mozcn:jd:union',

    // taobao (legacy)
    'http://click.mz.simba.taobao.com/rd?w=mmp4ptest&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_9313996&k=e02915d8b8ad9603': 'mozcn:taobao:legacy',
    'http://redirect.simba.taobao.com/rd?c=un&w=channel&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_9313997%26unid%3D&k=e02915d8b8ad9603&p=mm_28347190_2425761_9313997': 'mozcn:taobao:legacy',
    'http://redirect.simba.taobao.com/rd?c=un&w=channel&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_13466329%26unid%3D&k=e02915d8b8ad9603&p=mm_28347190_2425761_13466329': 'mozcn:taobao:legacy',

    // tmall (legacy)
    'http://www.tmall.com/go/chn/tbk_channel/tmall_new.php?pid=mm_28347190_2425761_9313996&eventid=101334': 'mozcn:tmall:legacy',

    // weibo
    'http://weibo.com/?c=spr_web_sq_firefox_weibo_t001': 'mozcn:weibo:home',

    // yhd
    'http://www.yihaodian.com/product/index.do?merchant=1&tracker_u=1787&tracker_type=1&uid=433588_test_': 'mozcn:yhd:home',

    // taobao
    'http://www.taobao.com/go/chn/tbk_channel/onsale.php?pid=mm_28347190_2425761_13730658&eventid=101329': 'mozcn:toolbar:taobao',

    // tmall
    'http://s.click.taobao.com/t_9?p=mm_28347190_2425761_13676372&l=http%3A%2F%2Fmall.taobao.com%2F': 'mozcn:toolbar:tmall',
    'http://s.click.taobao.com/t?e=zGU34CA7K%2BPkqB05%2Bm7rfGGjlY60oHcc7bkKOQYmIX0uNLK1pwv%2BifTaqFIrn1w%2FakplTBnP3D56LgXgufuIPG%2FcBYvSdiC2vkuCKsBVr8VLhdXwLQ%3D%3D': 'mozcn:toolbar:tmall',
    'http://s.click.taobao.com/t_9?p=mm_28347190_2425761_14472249&l=http%3A%2F%2Fmall.taobao.com%2F': 'mozcn:toolbar:tmall',
    'http://s.click.taobao.com/t?e=m%3D2%26s%3DGEWeb2k8yoQcQipKwQzePCperVdZeJviK7Vc7tFgwiFRAdhuF14FMXq0KRRmDoQot4hWD5k2kjNoVxuUFnM6iJG6UkagZE085UoOeRlV%2BcG%2Bh63zuUZMYYgaseAKBk0cDPtbhjM5VDw%3D': 'mozcn:toolbar:tmall',
    'http://s.click.taobao.com/t?e=m%3D2%26s%3D0XGYiwkvavMcQipKwQzePCperVdZeJviK7Vc7tFgwiFRAdhuF14FMagXItMrTZFp79%2FTFaMDK6RoVxuUFnM6iJG6UkagZE085UoOeRlV%2BcG%2Bh63zuUZMYYgaseAKBk0cLdkr8YvWKT4%3D': 'mozcn:toolbar:tmall',
    'http://s.click.taobao.com/t?e=m%3D2%26s%3DHLQ0nwFAGAUcQipKwQzePCperVdZeJviK7Vc7tFgwiFRAdhuF14FMfTDcs3PiqZXlovu%2FCElQOtoVxuUFnM6iJG6UkagZE085UoOeRlV%2BcG%2Bh63zuUZMYYgaseAKBk0cLdkr8YvWKT4%3D': 'mozcn:toolbar:tmall',

    // batch #2, for bug 2260
    'http://www.amazon.cn/?source=Mozilla': 'mozcn:amazoncn:home',
    'http://aos.prf.hn/click/camref:111lEF': 'mozcn:applestore:home',
    'https://www.baidu.com/index.php?tn=monline_3_dg': 'mozcn:baidu:home',
    'https://www.baidu.com/index.php?tn=monline_6_dg': 'mozcn:baidu:home',
    'http://ai.taobao.com/?pid=mm_28347190_2425761_17624777': 'mozcn:taobao:legacy',
    'http://ai.taobao.com/?pid=mm_28347190_2425761_20444747': 'mozcn:toolbar:taobao',
    'http://ai.taobao.com/?pid=mm_28347190_2425761_20450656': 'mozcn:toolbar:taobao',
    'http://ai.taobao.com/?pid=mm_28347190_2425761_20458269': 'mozcn:toolbar:taobao',
    'http://s.click.taobao.com/t?e=m%3D2%26s%3DIJymWS3%2FHfIcQipKwQzePCperVdZeJviK7Vc7tFgwiFRAdhuF14FMfYs3%2BfQ9YMc79%2FTFaMDK6RoVxuUFnM6iMUjUj9sJ%2FOjxctsWvavBZ6hMMc65kB68aUuZxIcp9pfUIgVEmFmgnbDX0%2BHH2IEVaX4VWt66S4EJPwiig1bxLP9BvYCQR6XAr%2BKQ71wHNCAqP8YyUoZZlq4cXg3ii9waXPs9Sj9Qli1np4c65at3FeX3cwyLTlAhj2l4PysJx%2FP': 'mozcn:toolbar:tmall11nov',
    'http://www.yihaodian.com/?tracker_u=10977119545': 'mozcn:yhd:home'
  },

  _backfillKeywords: function() {
    let backfillVersion = 0;
    try {
      // backfillversion was incorrectly set as bool pref in bug 1091
      if (this.prefs.getPrefType('backfillversion') == this.prefs.PREF_BOOL) {
        backfillVersion = this.prefs.getBoolPref('backfillversion') ? 1 : 0;
        this.prefs.clearUserPref('backfillversion');
        this.prefs.setIntPref('backfillversion', backfillVersion);
      } else {
        backfillVersion = this.prefs.getIntPref('backfillversion');
      }
    } catch(e) {}

    if (backfillVersion >= this._backfillVersion) {
      return;
    }

    let urls = Object.keys(this._keywordsForBookmarks);

    let self = this;
    // Since Fx 39
    if (PlacesUtils.keywords) {
      return Promise.all(urls.map(function(url) {
        return PlacesUtils.bookmarks.fetch({
          url: url
        }).then(function(bookmark) {
          // Working with keywords, not bookmarks, so just test for existance.
          if (!bookmark) {
            return;
          }

          return PlacesUtils.keywords.insert({
            keyword: self._keywordsForBookmarks[url],
            url: url
          }).catch(function(ex) {
            // ignore the case where 2+ urls of the same keyword exist.
          });
        });
      })).then(function() {
        self.prefs.setIntPref('backfillversion', self._backfillVersion);
        self.prefs.clearUserPref('migration');
      });
    } else {
      urls.forEach(function(aUrl) {
        let url = aUrl;
        let keyword = self._keywordsForBookmarks[url];
        let uri = Services.io.newURI(url, null, null);
        let bookmarks = PlacesUtils.bookmarks.getBookmarkIdsForURI(uri, {});
        for (let i = 0, l = bookmarks.length; i < l; i++) {
          PlacesUtils.bookmarks.setKeywordForBookmark(bookmarks[i], keyword);
        }
      });

      this.prefs.setIntPref('backfillversion', this._backfillVersion);
      this.prefs.clearUserPref('migration');
    }
  },

  _setFaviconForUrl(uri, iconData) {
    let faviconUri = Services.io.newURI('fake-favicon-uri:' + uri, null, null);
    this.fisvc.replaceFaviconDataFromDataURL(faviconUri, iconData, 0);
    let newUri = Services.io.newURI(uri, null, null);
    this.fisvc.setAndFetchFaviconForPage(newUri, faviconUri, false,
      this.fisvc.FAVICON_LOAD_NON_PRIVATE);
  },

  _tempFix: function() {
    let tempFixVersion = 0;
    try {
      tempFixVersion = this.prefs.getIntPref('tempfixversion');
    } catch(e) {}

    if (tempFixVersion >= this._tempFixVersion) {
      return;
    }

    let keyword = 'mozcn:toolbar:tmall11nov';
    let item = {
      favicon: 'data:image/png;base64,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',
      index: 4,
      parent: PlacesUtils.bookmarks.toolbarFolder,
      parentGuid: PlacesUtils.bookmarks.toolbarGuid,
      title: '\u5929\u732b\u53cc11',
      uri: 'http://s.click.taobao.com/t?e=m%3D2%26s%3DIJymWS3%2FHfIcQipKwQzePCperVdZeJviK7Vc7tFgwiFRAdhuF14FMfYs3%2BfQ9YMc79%2FTFaMDK6RoVxuUFnM6iMUjUj9sJ%2FOjxctsWvavBZ6hMMc65kB68aUuZxIcp9pfUIgVEmFmgnbDX0%2BHH2IEVaX4VWt66S4EJPwiig1bxLP9BvYCQR6XAr%2BKQ71wHNCAqP8YyUoZZlq4cXg3ii9waXPs9Sj9Qli1np4c65at3FeX3cwyLTlAhj2l4PysJx%2FP'
    };

    let bookmarks = [];
    let self = this;
    if (PlacesUtils.keywords) {
      return PlacesUtils.keywords.fetch(keyword).then(function(keywordObj) {
        if (!keywordObj) {
          return;
        }

        return PlacesUtils.bookmarks.fetch({
          url: keywordObj.url.href
        }, function(bookmark) {
          bookmarks.push(bookmark);
        });
      }).then(function() {
        if (bookmarks.filter(function(bookmark) {
          return bookmark.parentGuid === item.parentGuid;
        }).length) {
          return;
        }

        return PlacesUtils.bookmarks.insert({
          parentGuid: item.parentGuid,
          index: item.index,
          title: item.title,
          url: item.uri
        });
      }).then(function() {
        return Promise.all(bookmarks.map(function(bookmark) {
          bookmark.url = item.uri;
          if (item.title) {
            bookmark.title = item.title;
          }
          return PlacesUtils.bookmarks.update(bookmark);
        }));
      }).then(function() {
        if (item.favicon) {
          self._setFaviconForUrl(item.uri, item.favicon);
        }

        return PlacesUtils.keywords.insert({
          keyword: keyword,
          url: item.uri
        });
      }).then(function() {
        self.prefs.setIntPref('tempfixversion', self._tempFixVersion);
      });
    } else {
      let uri = PlacesUtils.bookmarks.getURIForKeyword(keyword);
      let newUri = Services.io.newURI(item.uri, null, null);

      if (uri) {
        bookmarks = PlacesUtils.bookmarks.getBookmarkIdsForURI(uri, {});
        // see comments in this._realUpdate
        bookmarks = bookmarks.filter(function(aId) {
          return PlacesUtils.bookmarks.getKeywordForBookmark(aId) == keyword;
        }).filter(function(aId) {
          return PlacesUtils.bookmarks.getFolderIdForItem(aId) == item.parent;
        });
      }

      if (!bookmarks.length) {
        let id = PlacesUtils.bookmarks.insertBookmark(
          item.parent, newUri, item.index, item.title);
        PlacesUtils.bookmarks.setKeywordForBookmark(id, keyword);
      }

      for (let i = 0, l = bookmarks.length; i < l; i++) {
        let id = bookmarks[i];
        PlacesUtils.bookmarks.changeBookmarkURI(id, newUri);

        if (item.title) {
          PlacesUtils.bookmarks.setItemTitle(id, item.title);
        }
      }

      if (item.favicon) {
        this._setFaviconForUrl(item.uri, item.favicon);
      }

      this.prefs.setIntPref('tempfixversion', this._tempFixVersion);
    }
  },

  _realUpdate: function(aUpdates, aSignature) {
    if (this._getCharPref('signature', '') == aSignature) {
      return;
    }

    let keywords = Object.keys(aUpdates);

    let self = this;
    if (PlacesUtils.keywords) {
      return Promise.all(keywords.map(function(keyword) {
        return PlacesUtils.keywords.fetch(keyword).then(function(keywordObj) {
          if (!keywordObj) {
            return;
          }

          let item = aUpdates[keyword];
          let bookmarks = [];
          return PlacesUtils.bookmarks.fetch({
            url: keywordObj.url.href
          }, function(bookmark) {
            bookmarks.push(bookmark);
          }).then(function() {
            return Promise.all(bookmarks.map(function(bookmark) {
              if (item.uri) {
                bookmark.url = item.uri;
                if (item.title) {
                  bookmark.title = item.title;
                }
                return PlacesUtils.bookmarks.update(bookmark);
              } else {
                /* an empty object could be used to remove bookmarks:
                   ... "mozcn:***:***": {}, ... */
                return PlacesUtils.bookmarks.remove(bookmark);
              }
            })).then(function() {
              if (!item.uri) {
                return;
              }

              if (item.favicon) {
                self._setFaviconForUrl(item.uri, item.favicon);
              }
              return PlacesUtils.keywords.insert({
                keyword: (item.keyword || keyword),
                url: item.uri
              });
            });
          });
        });
      })).then(function() {
        self.prefs.setCharPref('signature', aSignature);
      });
    } else {
      keywords.forEach(function(aKeyword) {
        let uri = PlacesUtils.bookmarks.getURIForKeyword(aKeyword);
        if (!uri) {
          return;
        }

        let item = aUpdates[aKeyword];
        let bookmarks = PlacesUtils.bookmarks.getBookmarkIdsForURI(uri, {});
        for (let i = 0, l = bookmarks.length; i < l; i++) {
          let id = bookmarks[i];
          // DO NOT change bookmark with matched url but not expected keyword
          if (PlacesUtils.bookmarks.getKeywordForBookmark(id) == aKeyword) {
            if (item.uri) {
              let newUri = Services.io.newURI(item.uri, null, null);
              PlacesUtils.bookmarks.changeBookmarkURI(id, newUri);

              if (item.title) {
                PlacesUtils.bookmarks.setItemTitle(id, item.title);
              }
              if (item.favicon) {
                self._setFaviconForUrl(item.uri, item.favicon);
              }
              if (item.keyword) {
                PlacesUtils.bookmarks.setKeywordForBookmark(id, item.keyword);
              }
            } else {
              /* an empty object could be used to remove bookmarks:
                 ... "mozcn:***:***": {}, ... */
              PlacesUtils.bookmarks.removeItem(id);
            }
          }
        }
      });

      this.prefs.setCharPref('signature', aSignature);
    }
  },

  update: function() {
    let self = this;
    this._fetch(this.updateUrl, function(aData) {
      if (SignatureVerifier.verify(aData.data, aData.signature)) {
        self._realUpdate(JSON.parse(aData.data), aData.signature);
      }
    });
  },

  _inited: false,

  _backfillVersion: 2,

  _tempFixVersion: 3,

  init: function() {
    if (this._inited) {
      return;
    }
    this._inited = true;

    let self = this;
    let promise = this._backfillKeywords();

    if (promise) {
      promise = promise.then(function() {
        return self._tempFix();
      });
    } else {
      promise = this._tempFix();
    }

    if (promise) {
      promise.then(function() {
        return self.update();
      })
    } else {
      this.update();
    }

    PlacesUtils.bookmarks.addObserver({
      onBeginUpdateBatch: function() {},
      onEndUpdateBatch: function() {},
      onItemAdded: function() {},
      onBeforeItemRemoved: function() {},
      onItemRemoved: function() {},
      onItemChanged: function() {},
      onItemVisited: function(aItemId, b, c, d, aURI, f, g, h) {
        let keyword = PlacesUtils.bookmarks.getKeywordForBookmark(aItemId);
        let prefix = 'mozcn:toolbar:';
        if (keyword && keyword.indexOf(prefix) == 0) {
          Tracking.track({
            type: 'bookmarks',
            action: 'click',
            sid: keyword.substring(prefix.length)
          });
        }
      },
      onItemMoved: function() {}
    }, false);
  },

  getUpdateTracking: function(aSlugs) {
    let ret = [];

    aSlugs.forEach(function(aSlug) {
      let keyword = 'mozcn:toolbar:' + aSlug;
      // until this sync call is broken
      let uri = PlacesUtils.bookmarks.getURIForKeyword(keyword);
      if (!uri) {
        return;
      }

      ret.push(aSlug);
    })
    return ret.join(',') || 'false';
  }
};
