(function() {
    var ns = MOA.ns('NTab');

    var _url = 'about:ntab';
    Cu.import('resource://ntab/quickdial.jsm');
    Cu.import('resource://ntab/QuickDialData.jsm');
    if (!window.NetUtil) {
      Cu.import('resource://gre/modules/NetUtil.jsm');
    }

    XPCOMUtils.defineLazyGetter(ns, "gScriptSecurityManager", function () {
        return (Services.scriptSecurityManager ||
                Cc["@mozilla.org/scriptsecuritymanager;1"].getService(Ci.nsIScriptSecurityManager));
    });

    XPCOMUtils.defineLazyGetter(ns, "gPrincipal", function () {
        var uri = Services.io.newURI(_url, null, null);
        return ns.gScriptSecurityManager.getCodebasePrincipal(uri);
    });

    function loadInExistingTabs() {
        if (!Services.prefs.getBoolPref("moa.ntab.loadInExistingTabs")) {
            return;
        }

        if (!Services.prefs.getBoolPref('moa.ntab.openInNewTab')) {
            return;
        }

        var chromehidden = document.getElementById('main-window').getAttribute('chromehidden');
        if (chromehidden.match(/menubar/))
            return;

        var tabs = gBrowser.tabContainer.childNodes;
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            if (!tab.hasAttribute('busy') && !tab.hasAttribute('isPermaTab')) {
                var doc = tab.linkedBrowser.contentDocument;
                if (doc && doc.location == 'about:blank') {
                    doc.location = _url;
                    tab.linkedBrowser.userTypedValue = '';
                }
            }
        }
    }

    var overrideInstallation = {
      prefKey: 'moa.ntab.oldinstalldate',

      get oldInstallDate() {
        var oldInstallDate = '';
        try {
          oldInstallDate = Services.prefs.getCharPref(this.prefKey);
        } catch(e) {}
        return oldInstallDate;
      },

      set oldInstallDate(val) {
        try {
          Services.prefs.setCharPref(this.prefKey, val);
        } catch(e) {}
      },

      get installDateFile() {
        var installDateFile = Services.dirsvc.get('XREExeF', Ci.nsILocalFile);
        installDateFile.leafName = 'distribution';
        installDateFile.append('myextensions');

        if (!installDateFile.exists() || !installDateFile.isDirectory()) {
          installDateFile = Services.dirsvc.get('CurProcD', Ci.nsILocalFile);
          installDateFile.append('distribution');
          installDateFile.append('myextensions');
        }
        installDateFile.append('installdate.ini');

        return installDateFile;
      },

      get newInstallDate() {
        var newInstallDate = '';
        var installDateFile = this.installDateFile;
        if (!installDateFile.exists() || installDateFile.isDirectory()) {
          return '';
        }

        var iniParser = Cc['@mozilla.org/xpcom/ini-parser-factory;1'].
                          getService(Ci.nsIINIParserFactory).
                          createINIParser(installDateFile);
        var sections = iniParser.getSections();
        var section = null;

        while (sections.hasMore()) {
          section = sections.getNext();
          try {
            newInstallDate += iniParser.getString(section, 'dwLowDateTime');
            newInstallDate += iniParser.getString(section, 'dwHighDateTime');
          } catch(e) {
            return '';
          }
        }

        if (!newInstallDate) {
          var fstream = Cc['@mozilla.org/network/file-input-stream;1'].
                          createInstance(Ci.nsIFileInputStream);
          fstream.init(installDateFile, -1, 0, 0);
          newInstallDate = NetUtil.readInputStreamToString(fstream, fstream.available());
        }

        return newInstallDate;
      },

      get isOverride() {
        var everSet = !!this.oldInstallDate;
        var changed = this.oldInstallDate != this.newInstallDate;
        if (!changed) {
          delete this.isOverride;
          return this.isOverride = false;
        }

        this.oldInstallDate = this.newInstallDate;
        // only a change with an exisiting pref count as an override
        delete this.isOverride;
        return this.isOverride = everSet;
      }
    };

    var homepageReset = {
      prefKeyHomepage: "browser.startup.homepage",
      prefKeyOtherNav: "moa.homepagereset.othernav.latestcheck",
      prefKeyPotentialHijack: "moa.homepagereset.potentialhijack.",

      notificationKey: "mo-reset-cehome",

      NO_REASON: 0,
      REASON_OVERRIDE_INSTALL: 1,
      REASON_OTHER_NAV: 2,
      REASON_POTENTIAL_HIJACK: 3,

      defaultHomepage: "about:cehome",
      defaultHomepages: [
        /^about:cehome$/,
        /^http:\/\/[a-z]+\.firefoxchina\.cn/
      ],

      otherNavs: [
        /^http:\/\/www\.hao123\.com/,
        /^http:\/\/www\.2345\.com/
      ],
      firstOtherNavUrl: null,

      get homepage() {
        var homepages = [this.defaultHomepage];
        try {
          homepages = Services.prefs.getComplexValue(this.prefKeyHomepage,
            Ci.nsIPrefLocalizedString).data.split("|");
        } catch(e) {}
        return homepages;
      },

      set homepage(homepage) {
        var defaultHomepages = [homepage];
        try {
          defaultHomepages = Services.prefs.getDefaultBranch("").
            getComplexValue(this.prefKeyHomepage,
              Ci.nsIPrefLocalizedString).data.split("|");
        } catch(e) {};

        var defaultHomepageIsCEHome =
          defaultHomepages.some(function(defaultHomepage) {
            return homepage == defaultHomepage;
          });

        if (defaultHomepageIsCEHome) {
          Services.prefs.clearUserPref(this.prefKeyHomepage);
        } else {
          try {
            Services.prefs.setCharPref(this.prefKeyHomepage, homepage);
          } catch(e) {}
        }
      },

      // for comparison, using int instead of string
      currentCheck: 20131129,

      get latestCheck() {
        var latestCheck = 0;
        try {
          latestCheck = Services.prefs.getIntPref(this.prefKeyOtherNav);
        } catch(e) {}
        return latestCheck;
      },

      set latestCheck(day) {
        try {
          Services.prefs.setIntPref(this.prefKeyOtherNav, day);
        } catch(e) {}
      },

      shouldNotify: function() {
        var homepages = this.homepage;
        var usingCEHome = this.defaultHomepages.some(function(regex) {
          return homepages.some(function(homepage) {
            return regex.test(homepage);
          });
        });

        if (usingCEHome) {
          return this.NO_REASON;
        }

        if (overrideInstallation.isOverride) {
          return this.REASON_OVERRIDE_INSTALL;
        }

        var firstOtherNav = "";
        var usingOtherNav = this.otherNavs.some(function(regex) {
          return homepages.some(function(homepage) {
            var match = regex.test(homepage);
            if (match) {
              firstOtherNav = homepage;
            }
            return match;
          });
        });

        if (!usingOtherNav) {
          return this.NO_REASON;
        }

        this.firstOtherNavUrl = Services.io.newURI(firstOtherNav, null, null)
                                        .QueryInterface(Ci.nsIURL);
        if (this.firstOtherNavUrl.query) {
          var latestCheck = 0;
          try {
            var prefKey = this.prefKeyPotentialHijack + this.firstOtherNavUrl.asciiHost;
            latestCheck = Services.prefs.getIntPref(prefKey);
          } catch(e) {}
          if (latestCheck < this.currentCheck) {
            return this.REASON_POTENTIAL_HIJACK;
          } else {
            return this.NO_REASON;
          }
        } else {
          if (this.latestCheck < this.currentCheck) {
            return this.REASON_OTHER_NAV;
          } else {
            return this.NO_REASON;
          }
        }
      },

      markShown: function() {
        this.latestCheck = this.currentCheck;
      },

      markNomore: function() {
        var prefKey = this.prefKeyPotentialHijack + this.firstOtherNavUrl.asciiHost;
        try {
          Services.prefs.setIntPref(prefKey, this.currentCheck);
        } catch(e) {}
      },

      check: function() {
        var reason = this.shouldNotify();
        var shownCallback = this.markShown.bind(this);
        var nomoreCallback = this.markNomore.bind(this);

        if (reason == this.NO_REASON) {
          return;
        }

        switch (reason) {
          case this.REASON_OVERRIDE_INSTALL:
            this.notify();
            break;
          case this.REASON_OTHER_NAV:
            this.notify(shownCallback);
            break;
          case this.REASON_POTENTIAL_HIJACK:
            this.notify(shownCallback, nomoreCallback);
            break;
          default:
            break;
        }

        MOA.NTab.track({
          type: "homepagereset",
          action: "notify",
          sid: reason,
          href: (this.firstOtherNavUrl && this.firstOtherNavUrl.spec)
        });
      },

      notify: function(aShownCallback, aNomoreCallback) {
        var stringBundle = document.getElementById('ntab-strings');

        var message = stringBundle.getString("homepagereset.notification.message");
        var resetText = stringBundle.getString("homepagereset.notification.reset");
        var noText = stringBundle.getString("homepagereset.notification.no");
        var nomoreText = stringBundle.getString("homepagereset.notification.nomore");

        var self = this;
        var buttons = [{
          label: resetText,
          accessKey: "R",
          callback: function() {
            self.reset();

            MOA.NTab.track({
              type: "homepagereset",
              action: "click",
              sid: "yes"
            });
          }
        }, {
          label: noText,
          accessKey: "N",
          callback: function() {
            MOA.NTab.track({
              type: "homepagereset",
              action: "click",
              sid: "no"
            });
          }
        }];

        if (aNomoreCallback) {
          buttons.push({
            label: nomoreText,
            accessKey: "D",
            callback: function() {
              aNomoreCallback();

              MOA.NTab.track({
                type: "homepagereset",
                action: "click",
                sid: "nomore"
              });
            }
          });
        }

        var notificationBox = gBrowser.getNotificationBox();
        var notificationBar =
          notificationBox.appendNotification(message, this.notificationKey, "",
            notificationBox.PRIORITY_INFO_MEDIUM, buttons);
        if (aShownCallback) {
          aShownCallback();
        }
        notificationBar.persistence = -1;
      },

      reset: function() {
        this.homepage = this.defaultHomepage;
      }
    }

    var partnerBookmark = {
        /*
        six entries in the _urlpairs:
        0: old url that will be replaced, required, will create new one if empty
        1: new url that will be replaced with, required, will delete old one if empty
        2: new title that will be used, if present
        3: favicon for the created new bookmark
        4: alias of the parent folder to create the new bookmark, defaults to unfiled
        5: index to create the new bookmark in the parent folder, defaults to appending
        */
        _urlpairs: [
            ['http://click.union.360buy.com/JdClick/?unionId=206&siteId=1&to=http://www.360buy.com/', 'http://click.union.360buy.com/JdClick/?unionId=20&siteId=439040_test_&to=http://www.360buy.com'],
            ['http://click.union.360buy.com/JdClick/?unionId=316&siteId=21946&to=http://www.360buy.com', 'http://click.union.360buy.com/JdClick/?unionId=20&siteId=439040_test_&to=http://www.360buy.com'],
            ['http://click.mz.simba.taobao.com/rd?w=mmp4ptest&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_9313996&k=e02915d8b8ad9603', 'http://redirect.simba.taobao.com/rd?c=un&w=channel&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_13466329%26unid%3D&k=e02915d8b8ad9603&p=mm_28347190_2425761_13466329'],
            ['http://redirect.simba.taobao.com/rd?c=un&w=channel&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_9313997%26unid%3D&k=e02915d8b8ad9603&p=mm_28347190_2425761_9313997', 'http://redirect.simba.taobao.com/rd?c=un&w=channel&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_13466329%26unid%3D&k=e02915d8b8ad9603&p=mm_28347190_2425761_13466329'],
            ['http://weibo.com/', 'http://weibo.com/?c=spr_web_sq_firefox_weibo_t001'],
            ['http://www.yihaodian.com/product/index.do?merchant=1&tracker_u=1787&tracker_type=1&uid=433588_test_', 'http://www.yihaodian.com?tracker_u=10977119545', '1\u53F7\u5546\u57CE'],
            ['http://s.click.taobao.com/t_9?p=mm_28347190_2425761_13676372&l=http%3A%2F%2Fmall.taobao.com%2F', 'http://s.click.taobao.com/t?e=m%3D2%26s%3D0XGYiwkvavMcQipKwQzePCperVdZeJviK7Vc7tFgwiFRAdhuF14FMagXItMrTZFp79%2FTFaMDK6RoVxuUFnM6iJG6UkagZE085UoOeRlV%2BcG%2Bh63zuUZMYYgaseAKBk0cLdkr8YvWKT4%3D'],
            ['http://s.click.taobao.com/t?e=zGU34CA7K%2BPkqB05%2Bm7rfGGjlY60oHcc7bkKOQYmIX0uNLK1pwv%2BifTaqFIrn1w%2FakplTBnP3D56LgXgufuIPG%2FcBYvSdiC2vkuCKsBVr8VLhdXwLQ%3D%3D', 'http://s.click.taobao.com/t?e=m%3D2%26s%3D0XGYiwkvavMcQipKwQzePCperVdZeJviK7Vc7tFgwiFRAdhuF14FMagXItMrTZFp79%2FTFaMDK6RoVxuUFnM6iJG6UkagZE085UoOeRlV%2BcG%2Bh63zuUZMYYgaseAKBk0cLdkr8YvWKT4%3D'],
            ['http://s.click.taobao.com/t_9?p=mm_28347190_2425761_14472249&l=http%3A%2F%2Fmall.taobao.com%2F', 'http://s.click.taobao.com/t?e=m%3D2%26s%3D0XGYiwkvavMcQipKwQzePCperVdZeJviK7Vc7tFgwiFRAdhuF14FMagXItMrTZFp79%2FTFaMDK6RoVxuUFnM6iJG6UkagZE085UoOeRlV%2BcG%2Bh63zuUZMYYgaseAKBk0cLdkr8YvWKT4%3D'],
            ['http://s.click.taobao.com/t?e=m%3D2%26s%3DGEWeb2k8yoQcQipKwQzePCperVdZeJviK7Vc7tFgwiFRAdhuF14FMXq0KRRmDoQot4hWD5k2kjNoVxuUFnM6iJG6UkagZE085UoOeRlV%2BcG%2Bh63zuUZMYYgaseAKBk0cDPtbhjM5VDw%3D', 'http://s.click.taobao.com/t?e=m%3D2%26s%3D0XGYiwkvavMcQipKwQzePCperVdZeJviK7Vc7tFgwiFRAdhuF14FMagXItMrTZFp79%2FTFaMDK6RoVxuUFnM6iJG6UkagZE085UoOeRlV%2BcG%2Bh63zuUZMYYgaseAKBk0cLdkr8YvWKT4%3D']
        ],

        _realVersion: 7,
        _versionPref: 'moa.partnerbookmark.migration',

        get bmsvc() {
            delete this.bmsvc;
            return this.bmsvc = Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
                                    .getService(Ci.nsINavBookmarksService);
        },
        get fisvc() {
            delete this.fisvc;
            return this.fisvc = Cc['@mozilla.org/browser/favicon-service;1']
                                    .getService(Ci.mozIAsyncFavicons || Ci.nsIFaviconService);
        },
        get ios() {
            delete this.ios;
            return this.ios = Cc["@mozilla.org/network/io-service;1"]
                                .getService(Ci.nsIIOService);
        },

        get version() {
            var version = 0;
            try {
                version = Services.prefs.getIntPref(this._versionPref);
            } catch(e) {}
            return version;
        },
        set version(version) {
            try {
                Services.prefs.setIntPref(this._versionPref, version);
            } catch(e) {}
        },

        monitorClick: function() {
            var urlsToMonitor = {
                'http://s.click.taobao.com/t?e=m%3D2%26s%3D0XGYiwkvavMcQipKwQzePCperVdZeJviK7Vc7tFgwiFRAdhuF14FMagXItMrTZFp79%2FTFaMDK6RoVxuUFnM6iJG6UkagZE085UoOeRlV%2BcG%2Bh63zuUZMYYgaseAKBk0cLdkr8YvWKT4%3D': 'tmall5',
                'http://www.taobao.com/go/chn/tbk_channel/onsale.php?pid=mm_28347190_2425761_13730658&eventid=101329': 'taobao'
            };
            this.bmsvc.addObserver({
                onBeginUpdateBatch: function() {},
                onEndUpdateBatch: function() {},
                onItemAdded: function() {},
                onBeforeItemRemoved: function() {},
                onItemRemoved: function() {},
                onItemChanged: function() {},
                onItemVisited: function(a, b, c, d, aURI, f, g, h) {
                    var tag = urlsToMonitor[aURI.spec];
                    if (tag) {
                        MOA.NTab.track({
                            type: 'bookmark',
                            action: 'click',
                            sid: tag
                        });
                    }
                },
                onItemMoved: function() {}
            }, false);
        },

        update: function() {
            if (this.version == this._realVersion) {
                return;
            }
            for (var i = 0, l = this._urlpairs.length; i < l; i++) {
                var origUri = null;
                if (this._urlpairs[i][0]) {
                    origUri = this.ios.newURI(this._urlpairs[i][0], null, null);
                }
                var newUri = null;
                if (this._urlpairs[i][1]) {
                    newUri = this.ios.newURI(this._urlpairs[i][1], null, null);
                }
                var newTitle = this._urlpairs[i][2] || '';
                if (origUri) {
                    var bookmarksArray = this.bmsvc.getBookmarkIdsForURI(origUri, {});
                    for (var j = 0, k = bookmarksArray.length; j < k; j++) {
                        if (newUri) {
                            this.bmsvc.changeBookmarkURI(bookmarksArray[j], newUri);
                            if (newTitle) {
                                this.bmsvc.setItemTitle(bookmarksArray[j], newTitle);
                            }
                        } else {
                            this.bmsvc.removeItem(bookmarksArray[j]);
                        }
                    }
                } else {
                    var newFavicon = this._urlpairs[i][3];
                    var newParent = this.bmsvc[this._urlpairs[i][4] || 'unfiledBookmarksFolder'];
                    var newIndex = this._urlpairs[i][5] || Ci.nsINavBookmarksService.DEFAULT_INDEX;
                    var existingArray = this.bmsvc.getBookmarkIdsForURI(newUri, {});
                    if (!existingArray.length && newUri && newTitle && newParent && newIndex) {
                        this.bmsvc.insertBookmark(newParent, newUri, newIndex, newTitle);
                        if (newFavicon) {
                            var faviconUri = this.ios.newURI("fake-favicon-uri:" + this._urlpairs[i][1], null, null);
                            if (Ci.mozIAsyncFavicons) {
                                this.fisvc.replaceFaviconDataFromDataURL(faviconUri, newFavicon, 0);
                                this.fisvc.setAndFetchFaviconForPage(newUri, faviconUri, false, this.fisvc.FAVICON_LOAD_NON_PRIVATE);
                            } else {
                                this.fisvc.setFaviconDataFromDataURL(faviconUri, newFavicon, 0);
                                this.fisvc.setAndLoadFaviconForPage(newUri, faviconUri, false, this.fisvc.FAVICON_LOAD_NON_PRIVATE);
                            }
                        }
                    }
                }
            }
            this.version = this._realVersion;
        }
    };

    var newTabPref = {
        _appPreloadKey: 'browser.newtab.preload',
        _appUrlKey: 'browser.newtab.url',
        extPrefKey: 'moa.ntab.openInNewTab',

        inUse: true,

        _observer: {
            QueryInterface: function(aIID) {
                if (aIID.equals(Ci.nsIObserver) ||
                    aIID.equals(Ci.nsISupports) ||
                    aIID.equals(Ci.nsISupportsWeakReference)) {
                    return this;
                }
                throw Cr.NS_NOINTERFACE;
            },

            observe: function(aSubject, aTopic, aData) {
                if (aTopic == 'nsPref:changed') {
                    switch (aData) {
                        case newTabPref.extPrefKey:
                            newTabPref.refresh();
                            break;
                    }
                }
            }
        },

        init: function() {
            Services.prefs.addObserver(this.extPrefKey, this._observer, true);
            this.refresh();

            gInitialPages.push(_url);
        },
        refresh: function() {
            this.inUse = Services.prefs.getBoolPref(this.extPrefKey);
            if (this.inUse) {
                try {
                    Services.prefs.clearUserPref(this._appUrlKey);
                    Services.prefs.clearUserPref(this._appPreloadKey);
                } catch(e) {};
            } else {
                Services.prefs.setCharPref(this._appUrlKey, "about:newtab");
            }
        }
    };

    ns.browserOpenTab = function(event) {
        if (newTabPref.inUse) {
            openUILinkIn(_url, 'tab');

            // for Fx 12 and older versions
            focusAndSelectUrlBar();
        } else {
            window.originalBrowserOpenTab(event);
        }
    };

    var fakeZoom = {
        setExtraWidth: function(direction) {
            var extraWidth = Services.prefs.getIntPref('moa.ntab.dial.extrawidth');
            extraWidth = extraWidth + direction * 50;
            Services.prefs.setIntPref('moa.ntab.dial.extrawidth', extraWidth);
        },

        _setZoomForBrowser: null,
        setZoomForBrowser: function(aBrowser, aVal) {
            var browser = aBrowser || gBrowser.selectedBrowser;
            if (browser.contentDocument.URL == _url) {
                var origVal = ZoomManager.getZoomForBrowser(aBrowser);
                var offset = aVal - origVal;
                if (offset) {
                    this.setExtraWidth(offset / Math.abs(offset));
                }
            } else {
                this._setZoomForBrowser(aBrowser, aVal);
            }
        },

        _handleMouseScrolled: function(evt) {
            if (gBrowser.selectedBrowser.contentDocument.URL == _url) {
                var pref = 'mousewheel.';

                if (evt.getModifierState) {
                    var pressedModifierCount = evt.shiftKey + evt.ctrlKey + evt.altKey +
                                               evt.metaKey + evt.getModifierState('OS');
                    if (pressedModifierCount != 1) {
                        pref += 'default.';
                    } else if (evt.shiftKey) {
                        pref += 'with_shift.';
                    } else if (evt.ctrlKey) {
                        pref += 'with_control.';
                    } else if (evt.altKey) {
                        pref += 'with_alt.';
                    } else if (evt.metaKey) {
                        pref += 'with_meta.';
                    } else {
                        pref += 'with_win.';
                    }
                } else {
                    if (evt.axis == evt.HORIZONTAL_AXIS) {
                        pref += 'horizscroll.';
                    }

                    if (evt.shiftKey) {
                        pref += 'withshiftkey.';
                    } else if (evt.ctrlKey) {
                        pref += 'withcontrolkey.';
                    } else if (evt.altKey) {
                        pref += 'withaltkey.';
                    } else if (evt.metaKey) {
                        pref += 'withmetakey.';
                    } else {
                        pref += 'withnokey.';
                    }
                }

                pref += 'action';

                var isZoomEvent = false;
                try {
                    isZoomEvent = Services.prefs.getIntPref(pref) == (FullZoom.ACTION_ZOOM || MOUSE_SCROLL_ZOOM);
                } catch(e) {}
                if (!isZoomEvent) {
                    return;
                }

                evt.preventDefault();

                if (evt.detail) {
                    this.setExtraWidth(-evt.detail / Math.abs(evt.detail));
                }
            } else {
                FullZoom._handleMouseScrolled(evt);
            }
        },
        handleEvent: function(evt) {
            switch(evt.type) {
                case 'DOMMouseScroll':
                    this._handleMouseScrolled(evt);
                    break;
            }
        },

        init: function() {
            this._setZoomForBrowser = ZoomManager.setZoomForBrowser.bind(ZoomManager);
            ZoomManager.setZoomForBrowser = this.setZoomForBrowser.bind(this);

            FullZoom.handleEvent = this.handleEvent.bind(this);
        }
    };

    ns.onLoad = function() {
        // load ntab page in existing empty tabs.
        // Under Firefox5, this function will open "about:ntab" in the blank page in which
        // the welcome page is opened.
        // So set an timeout to run this function, make sure welcome page will be opened.
        setTimeout(function() {
            loadInExistingTabs();
        }, 1000);

        // Catch new tab
        if (window.TMP_BrowserOpenTab) {
            gBrowser.removeEventListener('NewTab', window.TMP_BrowserOpenTab, true);
            gBrowser.removeEventListener('NewTab', window.BrowserOpenTab, true);
            window.originalBrowserOpenTab = window.TMP_BrowserOpenTab;
            window.BrowserOpenTab = window.TMP_BrowserOpenTab = MOA.NTab.browserOpenTab;
            gBrowser.addEventListener('NewTab', window.BrowserOpenTab, true);
        } else if (window.TBP_BrowserOpenTab) {
            gBrowser.removeEventListener('NewTab', window.TBP_BrowserOpenTab, true);
            window.originalBrowserOpenTab = window.TBP_BrowserOpenTab;
            window.TBP_BrowserOpenTab = MOA.NTab.browserOpenTab;
            gBrowser.addEventListener('NewTab', window.TBP_BrowserOpenTab, true);
        } else {
            gBrowser.removeEventListener('NewTab', window.BrowserOpenTab, false);
            window.originalBrowserOpenTab = window.BrowserOpenTab;
            window.BrowserOpenTab = MOA.NTab.browserOpenTab;
            gBrowser.addEventListener('NewTab', window.BrowserOpenTab, false);
        }

        fakeZoom.init();

        newTabPref.init();
        partnerBookmark.update();
        partnerBookmark.monitorClick();
        QuickDialData.update();
        homepageReset.check();
    };

    ns.onMenuItemCommand = function(event) {
        if (event.target.tagName != 'menuitem')
            return;
        var url, title;
        url = gContextMenu.linkURL;
        if (url) {
            title = gContextMenu.linkText();
        } else {
            url = window._content.document.location.href;
            title = window._content.document.title;
        }

        var stringBundle = document.getElementById('ntab-strings');

        if (!isValidURI(url)) {
            Services.prompt.alert(null,
              stringBundle.getString('ntab.contextmenu.title'),
              stringBundle.getString('ntab.contextmenu.invalidurl'));
            return;
        }

        var index = quickDialModule.fillBlankDial({
            title: title,
            url: url
        });

        if (index > 0) {
            Services.prompt.alert(null,
              stringBundle.getString('ntab.contextmenu.title'),
              stringBundle.getFormattedString('ntab.contextmenu.addedtodial', [index]));
        } else {
            Services.prompt.alert(null,
              stringBundle.getString('ntab.contextmenu.title'),
              stringBundle.getString('ntab.contextmenu.noblankdial'));
        }
    };

    var isValidURI = function (aURI) {
      try {
        ns.gScriptSecurityManager.
          checkLoadURIStrWithPrincipal(ns.gPrincipal,
            aURI,
            Ci.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL |
            Ci.nsIScriptSecurityManager.DONT_REPORT_ERRORS);
        return true;
      } catch(e) {
        return false;
      }
    };

    function getDialNum(elem) {
        var num = -1;
        while (!(elem instanceof HTMLBodyElement)) {
            if (elem.hasAttribute('data-index') &&
                parseInt(elem.getAttribute('data-index'), 10) > -1 &&
                elem.getAttribute('draggable') == 'true') {
                num = parseInt(elem.getAttribute('data-index'), 10);
                break;
            }

            elem = elem.parentNode;
        }

        return num;
    }

    var toggleUseOpacity = function() {
        var useOpacity = Services.prefs.getBoolPref("moa.ntab.dial.useopacity");
        Services.prefs.setBoolPref("moa.ntab.dial.useopacity", !useOpacity);
    };

    var openCEHPOptions = function() {
        var features = "chrome,titlebar,toolbar,centerscreen";
        try {
            var instantApply = Services.prefs.getBoolPref("browser.preferences.instantApply");
            features += instantApply ? ",dialog=no" : ",modal";
        } catch (e) {
            features += ",modal";
        }
        window.openDialog("chrome://ntab/content/options.xul", "cehpOptions", features).focus();
    };

    var resetAboutNTab = function() {
        var p = Services.prompt;
        var stringBundle = document.getElementById('ntab-strings');
        if (p.confirmEx(null,
                stringBundle.getString('ntab.contextmenu.title'),
                stringBundle.getString('ntab.contextmenu.reset'),
                p.STD_YES_NO_BUTTONS + p.BUTTON_POS_1_DEFAULT + p.BUTTON_DELAY_ENABLE,
                '', '', '', null, {}) === 0) {
            QuickDialData.reset();

            // toggle this pref will trigger Grid.update() in about:ntab
            Services.prefs.setBoolPref(
                "moa.ntab.dial.refreshhack",
                !Services.prefs.getBoolPref("moa.ntab.dial.refreshhack"));
        }
    };

    var _num = -1;
    ns.onContextCommand = function(event, menuid) {
        switch (menuid) {
            case 'nt-refresh':
                content.wrappedJSObject.Grid.refreshGridItem(_num);
                break;
            case 'nt-refreshall':
                content.wrappedJSObject.Grid.refreshAll();
                break;
            case 'nt-edit':
                content.wrappedJSObject.Grid.editGridItem(_num);
                break;
            case 'nt-export':
                content.wrappedJSObject.DataBackup.exportToFile();
                break;
            case 'nt-import':
                content.wrappedJSObject.DataBackup.importFromFile();
                break;
            case 'nt-useopacity':
                toggleUseOpacity();
                break;
            case 'nt-moreoptions':
                openCEHPOptions();
                break;
            case 'nt-reset':
                resetAboutNTab();
                break;
        }
    };

    ns.onContextMenu = function(event) {
        _num = getDialNum(event.target);

        document.getElementById('nt-refresh').hidden = _num < 0;
        document.getElementById('nt-edit').hidden = _num < 0;
        document.getElementById('nt-refreshall').hidden = Services.prefs.getCharPref('moa.ntab.view') !== 'quickdial';

        document.getElementById('nt-menu').openPopupAtScreen(event.screenX, event.screenY, true);

        event.preventDefault();
        event.stopPropagation();
    };

    ns.onKeydown = function(evt) {
        //var selectedDocument = gBrowser.selectedBrowser.contentDocument;
        if (//selectedDocument.URL == _url &&
            Services.prefs.getBoolPref('moa.ntab.display.usehotkey') &&
            evt.ctrlKey && 48 < evt.keyCode && evt.keyCode <= 57) {
            evt.preventDefault();
            evt.stopPropagation();
            var index = evt.keyCode - 48 || 10;
            /*var selector = ['li[data-index="', index, '"] > a'].join('');
            var anchor = selectedDocument.querySelector(selector);
            if (anchor) {
                var clickEvt = selectedDocument.createEvent("MouseEvents");
                clickEvt.initMouseEvent("click", true, true,
                    selectedDocument.defaultView,
                    0, 0, 0, 0, 0, false, false, false, false, 0, null);
                anchor.dispatchEvent(clickEvt);
            }*/
            var dial = quickDialModule.getDial(index);
            if(dial && dial.url) {
                openUILinkIn(dial.url, 'tab');
            }
        }
    };

    ns.onContextMenuGlobal = function() {
        document.getElementById('context-ntab').hidden = !Services.prefs.getBoolPref('moa.ntab.contextMenuItem.show') || window._content.document.location.href == _url;
    };

    ns.isValidURI = isValidURI;

    var _trackurl = 'http://addons.g-fox.cn/ntab.gif';
    var _extend = function (src, target) {
        for (var key in src) {
            target[key] = src[key];
        }
        return target;
    }

    ns.track = function(option) {
        option = _extend(option, {
            type: '',
            action: '',
            fid: '',
            sid: '',
            href: '',
            title: ''
        });

        if (!option.type && !option.sid && !option.action)
            return;

        var image = new Image();
        var args = [];
        args.push('c=ntab');
        args.push('t=' + encodeURIComponent(option.type));
        args.push('a=' + encodeURIComponent(option.action));
        args.push('d=' + encodeURIComponent(option.sid));
        args.push('f=' + encodeURIComponent(option.fid));
        if (option.title) {
            args.push('ti=' + encodeURIComponent(option.title).substr(0, 200));
        }
        if (option.href) {
            args.push('hr=' + encodeURIComponent(option.href).substr(0, 200));
        }
        args.push('r=' + Math.random());
        args.push('cid=' + Application.prefs.getValue("app.chinaedition.channel","www.firefox.com.cn"));
        image.src = _trackurl + '?' + args.join('&');
    };
})();

window.addEventListener("load", function() {
    window.setTimeout(function() {
        MOA.NTab.onLoad();
        gBrowser.addEventListener("contextmenu", MOA.NTab.onContextMenuGlobal, false);
        window.addEventListener("keydown", MOA.NTab.onKeydown, true);
    }, 1);
}, false);
