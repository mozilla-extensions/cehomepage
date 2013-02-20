(function() {
    var ns = MOA.ns('NTab');

    var gPref = Components.classes["@mozilla.org/preferences-service;1"]
               .getService(Components.interfaces.nsIPrefService)
               .QueryInterface(Components.interfaces.nsIPrefBranch2);

    var _url = 'about:ntab';
    Components.utils['import']('resource://ntab/quickdial.jsm');
    Components.utils['import']('resource://ntab/QuickDialData.jsm');

    function loadInExistingTabs() {
        if (!gPref.getBoolPref("moa.ntab.loadInExistingTabs")) {
            return;
        }

        if (!gPref.getBoolPref('moa.ntab.openInNewTab')) {
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

    var partnerBookmark = {
        _urlpairs: [
            ['http://click.union.360buy.com/JdClick/?unionId=206&siteId=1&to=http://www.360buy.com/', 'http://click.union.360buy.com/JdClick/?unionId=20&siteId=439040_test_&to=http://www.360buy.com'],
            ['http://click.union.360buy.com/JdClick/?unionId=316&siteId=21946&to=http://www.360buy.com', 'http://click.union.360buy.com/JdClick/?unionId=20&siteId=439040_test_&to=http://www.360buy.com'],
            ['http://click.mz.simba.taobao.com/rd?w=mmp4ptest&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_9313996&k=e02915d8b8ad9603', 'http://redirect.simba.taobao.com/rd?c=un&w=channel&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_9313997%26unid%3D&k=e02915d8b8ad9603&p=mm_28347190_2425761_9313997']
        ],
        _realVersion: 2,
        _versionPref: 'moa.partnerbookmark.migration',

        get bmsvc() {
            delete this.bmsvc;
            return this.bmsvc = Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
                                    .getService(Ci.nsINavBookmarksService);
        },
        get ios() {
            delete this.ios;
            return this.ios = Cc["@mozilla.org/network/io-service;1"]
                                .getService(Ci.nsIIOService);
        },

        get version() {
            var version = 0;
            try {
                version = gPref.getIntPref(this._versionPref);
            } catch(e) {}
            return version;
        },
        set version(version) {
            try {
                gPref.setIntPref(this._versionPref, version);
            } catch(e) {}
        },

        update: function() {
            if (this.version == this._realVersion) {
                return;
            }
            for (var i = 0, l = this._urlpairs.length; i < l; i++) {
                var origUri = this.ios.newURI(this._urlpairs[i][0], null, null);
                var newUri = null;
                if (this._urlpairs[i][1]) {
                    newUri = this.ios.newURI(this._urlpairs[i][1], null, null);
                }
                var bookmarksArray = this.bmsvc.getBookmarkIdsForURI(origUri, {});
                for (var j = 0, k = bookmarksArray.length; j < k; j++) {
                    if (newUri) {
                        this.bmsvc.changeBookmarkURI(bookmarksArray[j], newUri);
                    } else {
                        this.bmsvc.removeItem(bookmarksArray[j]);
                    }
                }
            }
            this.version = this._realVersion;
        }
    };

    var newTabPref = {
        _appPrefKey: 'browser.newtab.url',
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
            gPref.addObserver(this.extPrefKey, this._observer, true);
            this.refresh();

            gInitialPages.push(_url);
        },
        refresh: function() {
            this.inUse = gPref.getBoolPref(this.extPrefKey);
            if (this.inUse) {
                gPref.setCharPref(this._appPrefKey, _url);
            } else {
                gPref.clearUserPref(this._appPrefKey);
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
            var extraWidth = gPrefService.getIntPref('moa.ntab.dial.extrawidth');
            extraWidth = extraWidth + direction * 50;
            gPrefService.setIntPref('moa.ntab.dial.extrawidth', extraWidth);
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

                pref += 'action';

                var isZoomEvent = false;
                try {
                    isZoomEvent = gPrefService.getIntPref(pref) == MOUSE_SCROLL_ZOOM;
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
        QuickDialData.update();
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

        if (!isValidUrl(url)) {
            alert(document.getElementById('ntab-strings').getString('ntab.contextmenu.invalidurl'));
            return;
        }

        var index = quickDialModule.fillBlankDial({
            title: title,
            url: url
        });

        if (index > 0) {
            alert(document.getElementById('ntab-strings').getFormattedString('ntab.contextmenu.addedtodial', [index]));
        } else {
            alert(document.getElementById('ntab-strings').getString('ntab.contextmenu.noblankdial'));
        }
    };

    var isValidUrl = function (aUrl) {
      // valid urls don't contain spaces ' '; if we have a space it isn't a valid url.
      // Also disallow dropping javascript: or data: urls--bail out
      if (!aUrl || !aUrl.length || aUrl.indexOf(" ", 0) != -1 ||
           /^\s*(javascript|data|chrome):/.test(aUrl))
        return false;

      return true;
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
        var useOpacity = gPrefService.getBoolPref("moa.ntab.dial.useopacity");
        gPrefService.setBoolPref("moa.ntab.dial.useopacity", !useOpacity);
    };

    var openCEHPOptions = function() {
        var features = "chrome,titlebar,toolbar,centerscreen";
        try {
            var instantApply = gPrefService.getBoolPref("browser.preferences.instantApply");
            features += instantApply ? ",dialog=no" : ",modal";
        } catch (e) {
            features += ",modal";
        }
        window.openDialog("chrome://ntab/content/options.xul", "cehpOptions", features).focus();
    }

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
        }
    };

    ns.onContextMenu = function(event) {
        _num = getDialNum(event.target);

        document.getElementById('nt-refresh').hidden = _num < 0;
        document.getElementById('nt-edit').hidden = _num < 0;
        document.getElementById('nt-refreshall').hidden = gPref.getCharPref('moa.ntab.view') !== 'quickdial';

        document.getElementById('nt-menu').openPopupAtScreen(event.screenX, event.screenY, true);

        event.preventDefault();
        event.stopPropagation();
    };

    ns.onKeydown = function(evt) {
        //var selectedDocument = gBrowser.selectedBrowser.contentDocument;
        if (//selectedDocument.URL == _url &&
            gPref.getBoolPref('moa.ntab.display.usehotkey') &&
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
        document.getElementById('context-ntab').hidden = !gPref.getBoolPref('moa.ntab.contextMenuItem.show') || window._content.document.location.href == _url;
    };
})();

window.addEventListener("load", function() {
    window.setTimeout(function() {
        MOA.NTab.onLoad();
        gBrowser.addEventListener("contextmenu", MOA.NTab.onContextMenuGlobal, false);
        window.addEventListener("keydown", MOA.NTab.onKeydown, true);
    }, 1);
}, false);
