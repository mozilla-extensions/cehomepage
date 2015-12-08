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

    let keyword = 'mozcn:toolbar:taobao12dec';
    let item = {
      favicon: 'data:image/png;base64,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',
      index: 4,
      parent: PlacesUtils.bookmarks.toolbarFolder,
      parentGuid: PlacesUtils.bookmarks.toolbarGuid,
      title: '\u6dd8\u5b9d\u53cc12',
      uri: 'http://s.click.taobao.com/t?e=m%3D2%26s%3DFEuJ5ZAKQ%2FkcQipKwQzePCperVdZeJviLKpWJ%2Bin0XJRAdhuF14FMdr%2FFqSQluTn1aH1Hk3GeOhoVxuUFnM6iMUjUj9sJ%2FOjkPiKwSWyD2b8vekcD5j4y7g5kJpUiIWcbYbSbVjnPd7DX0%2BHH2IEVaDF6DfW5eWK47FHjfsActnyHL0%2Bek76Z2L5qldaMNQnwwHtdTNPQJ8vGi9uMcjVheUuB3K%2FJ59GIO2NZx5EuPx%2F0%2BTbAU5P3G0F05MOIR43yoVdc9yqaPhUqpJROUkU%2BZ%2B5TMisDz%2F3ofaxk5PnWYoA5NwsA3beVGOHuAwDJLdg158qROwFt0RPtx0Qs0xrF05U%2BEi82A4g47KQn%2BRht24hhQs2DjqgEA%3D%3D'
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

  _tempFixVersion: 4,

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
