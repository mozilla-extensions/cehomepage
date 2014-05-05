/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let Cu = Components.utils;
let Cr = Components.results;
let Ci = Components.interfaces;
let Cc = Components.classes;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PageThumbs",
  "resource://gre/modules/PageThumbs.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PageThumbsStorage",
  "resource://gre/modules/PageThumbs.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS",
  "resource://gre/modules/osfile.jsm");

XPCOMUtils.defineLazyGetter(this, "BackgroundPageThumbs", function() {
  let temp = {};
  try {
    Cu.import("resource://gre/modules/BackgroundPageThumbs.jsm", temp);

    if (!BackgroundPageThumbs.captureIfMissing) {
      throw new Error("BackgroundPageThumbs not recent enough");
    }
  } catch(e) {
    /*
     * a local copy of BackgroundPageThumbs.jsm as in Fx 27.0.1, if
     * 1. resource://gre/modules/BackgroundPageThumbs.jsm does not exist;
     * 2. resource://gre/modules/BackgroundPageThumbs.jsm from esr24.
     */
    Cu.import("resource://ntab/BackgroundPageThumbs.jsm", temp);
  }
  return temp.BackgroundPageThumbs;
});

XPCOMUtils.defineLazyModuleGetter(this, "Frequent",
  "resource://ntab/History.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Session",
  "resource://ntab/History.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NTabDB",
  "resource://ntab/NTabDB.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Tracking",
  "resource://ntab/Tracking.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "sessionStore",
  "@mozilla.org/browser/sessionstore;1",
  "nsISessionStore");

function mozCNUtils() {}

mozCNUtils.prototype = {
  classID: Components.ID("{828cb3e4-a050-4f95-8893-baa0b00da7d7}"),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsIMessageListener]),

  // nsIObserver
  observe: function MCU_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "profile-after-change":
        Services.obs.addObserver(this, "browser-delayed-startup-finished", false);
        Services.obs.addObserver(this, "document-element-inserted", false);
        Services.obs.addObserver(this, "http-on-examine-response", false);
        Services.obs.addObserver(this, "http-on-examine-cached-response", false);
        Services.obs.addObserver(this, "http-on-examine-merged-response", false);
        NTabDB.migrateNTabData();
        this.initMessageListener();
        break;
      case "browser-delayed-startup-finished":
        this.initProgressListener(aSubject);
        break;
      case "http-on-examine-response":
      case "http-on-examine-cached-response":
      case "http-on-examine-merged-response":
        this.trackHTTPStatus(aSubject, aTopic);
        break;
      case "document-element-inserted":
        this.injectMozCNUtils(aSubject);
        break;
    }
  },

  trackHTTPStatus: function MCU_trackHTTPStatus(aSubject, aTopic) {
    let channel = aSubject;
    channel.QueryInterface(Ci.nsIHttpChannel);

    if ([
      NTabDB.uri.prePath,
      "http://i.g-fox.cn",
      "http://i.firefoxchina.cn"
    ].indexOf(channel.URI.prePath) == -1 ||
        !(channel.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI)) {
      return;
    }

    if ([200, 302, 304].indexOf(channel.responseStatus) == -1) {
      Tracking.track({
        type: "http-status",
        sid: channel.responseStatus,
        action: aTopic,
        href: channel.URI.spec,
        altBase: "http://robust.g-fox.cn/ntab.gif"
      });
    }
  },

  // nsIMessageListener
  receiveMessage: function MCU_receiveMessage(aMessage) {
    let w = aMessage.target.ownerDocument.defaultView;

    switch (aMessage.name) {
      case "AboutNTab:downloads":
        w.BrowserDownloadsUI();
        break;
      case "AboutNTab:bookmarks":
        w.PlacesCommandHook.showPlacesOrganizer("AllBookmarks");
        break;
      case "AboutNTab:history":
        w.PlacesCommandHook.showPlacesOrganizer("History");
        break;
      case "AboutNTab:addons":
        w.BrowserOpenAddonsMgr();
        break;
      case "AboutNTab:sync":
        w.openPreferences("paneSync");
        break;
      case "AboutNTab:settings":
        w.openPreferences();
        break;
    }
  },

  MESSAGES: [
    "AboutNTab:downloads",
    "AboutNTab:bookmarks",
    "AboutNTab:history",
    "AboutNTab:addons",
    "AboutNTab:sync",
    "AboutNTab:settings"
  ],
  initMessageListener: function MCU_initMessageListener() {
    let mm = Cc["@mozilla.org/globalmessagemanager;1"].
               getService(Ci.nsIMessageListenerManager);

    for (let msg of this.MESSAGES) {
      mm.addMessageListener(msg, this);
    }
  },

  // before we can fix the OfflineCacheInstaller ?
  initProgressListener: function MCU_initProgressListener(aSubject) {
    let w = aSubject;
    let fallbackURL = "about:blank";
    w.gBrowser.addTabsProgressListener({
      onLocationChange: function(aBrowser, b, aRequest, aLocation, aFlags) {
        if ((aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_ERROR_PAGE) &&
            aLocation.equals(NTabDB.uri)) {
          aRequest.cancel(Cr.NS_BINDING_ABORTED);
          aBrowser.webNavigation.loadURI(fallbackURL, null, null, null, null);
        }
      }
    });
  },

  injectMozCNUtils: function MCU_injectMozCNUtils(aSubject) {
    try {
      let w = aSubject.defaultView;

      this.attachToWindow(w);
    } catch(e) {}
  },

  attachToWindow: function MCU_attachToWindow(aWindow) {
    let docURI = aWindow.document.documentURIObject;

    let baseDomain = Services.eTLD.getBaseDomain(docURI);
    if (baseDomain !== "firefoxchina.cn") {
      return;
    }

    if (docURI.equals(NTabDB.uri) ||
        docURI.equals(NTabDB.privateUri)) {
      let browser = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).
                      getInterface(Ci.nsIWebNavigation).
                      QueryInterface(Ci.nsIDocShell).
                      chromeEventHandler;
      let contentScript = "chrome://ntab/content/ntabContent.js";
      browser.messageManager.loadFrameScript(contentScript, false);

      aWindow.addEventListener("mozCNUtils:Tracking", function(aEvt) {
        Tracking.track(aEvt.detail);
      });
    }

    /*
     * from cehomepage @ chrome/content/history.js
     * figure out which ones are actually used
     */
    let mozCNUtilsObj = {
      frequent: {
        enumerable: true,
        configurable: true,
        writable: true,
        value: {
          queryAsync: function(aLimit, aCallback) {
            Frequent.query(function(aEntries) {
              aEntries.forEach(function(aEntry) {
                aEntry.__exposedProps__ = {
                  title: "r",
                  url: "r"
                }
              });
              aCallback(aEntries);
            }, aLimit);
          },
          remove: function(aUrl) {
            Frequent.remove([aUrl]);
          },
          __exposedProps__: {
            queryAsync: "r",
            remove: "r"
          }
        }
      },

      last: {
        enumerable: true,
        configurable: true,
        writable: true,
        value: {
          queryAsync: function(aLimit, aCallback) {
            Session.query(function(aEntries) {
              aEntries.forEach(function(aEntry) {
                aEntry.__exposedProps__ = {
                  title: "r",
                  url: "r"
                }
              });
              aCallback(aEntries);
            }, aLimit);
          },
          remove: function(aUrl) {
            Session.remove([aUrl]);
          },
          __exposedProps__: {
            queryAsync: "r",
            remove: "r"
          }
        }
      },

      sessionStore: {
        enumerable: true,
        configurable: true,
        writable: true,
        value: {
          get canRestoreLastSession() {
            return sessionStore.canRestoreLastSession;
          },
          restoreLastSession: function() {
            if (sessionStore.canRestoreLastSession) {
              sessionStore.restoreLastSession();
            }
          },
          __exposedProps__: {
            canRestoreLastSession: "r",
            restoreLastSession: "r"
          }
        }
      },

      startup: {
        enumerable: true,
        configurable: true,
        writable: true,
        value: {
          homepage: function() {},
          homepage_changed: function() {},
          page: function() {},
          page_changed: function() {},
          cehomepage: function() {},
          autostart: function(aFlag) {},
          channelid: function() {},
          setHome: function(aUrl) {},
          __exposedProps__: {
            homepage: "r",
            homepage_changed: "r",
            page: "r",
            page_changed: "r",
            cehomepage: "r",
            autostart: "r",
            channelid: "r",
            setHome: "r"
          }
        }
      },

      // for offlintab
      bookmarks: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: {
          queryAsync: function(aCallback) {
            let db = Cc['@mozilla.org/browser/nav-history-service;1'].
                       getService(Ci.nsINavHistoryService).
                       QueryInterface(Ci.nsPIPlacesDatabase).
                       DBConnection;
            let sql = ('SELECT b.title as title, p.url as url ' +
                       'FROM moz_bookmarks b, moz_places p ' +
                       'WHERE b.type = 1 AND b.fk = p.id AND p.hidden = 0');
            let statement = db.createAsyncStatement(sql);
            let links = [];
            db.executeAsync([statement], 1, {
              handleResult: function(aResultSet) {
                let row;

                while (row = aResultSet.getNextRow()) {
                  let title = row.getResultByName("title");
                  let url = row.getResultByName("url");

                  links.push({
                    title: title,
                    url: url,
                    __exposedProps__: {
                      title: "r",
                      url: "r"
                    }
                  });
                }
              },
              handleError: function(aError) {
                aCallback([]);
              },
              handleCompletion: function(aReason) {
                aCallback(links);
              }
            });
          },
          __exposedProps__: {
            queryAsync: "r"
          }
        }
      },

      thumbs: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: {
          getThumbnail: function(aUrl) {
            let request = Services.DOMRequest.createRequest(aWindow);

            // we will have to back port this to previous Fx versions
            /* use capture instead of captureIfMissing to force generate the
               good looking version */
            BackgroundPageThumbs.capture(aUrl, {
              onDone: function() {
                let path = "";
                if (PageThumbs.getThumbnailPath) {
                  path = PageThumbs.getThumbnailPath(aUrl);
                } else {
                  path = PageThumbsStorage.getFilePathForURL(aUrl);
                }
                OS.File.read(path).then(function(aData) {
                  let blob = new aWindow.Blob([aData], {
                    type: PageThumbs.contentType
                  });
                  Services.DOMRequest.fireSuccess(request, blob);
                }, function(aError) {
                  Services.DOMRequest.fireError(request, "OS.File");
                });
              }
            });

            return request;
          },
          __exposedProps__: {
            getThumbnail: "r"
          }
        }
      },

      variant: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: {
          get channel() {
            let channel = "master-ii";
            try {
              channel = Services.prefs.getCharPref("moa.ntab.dial.branch");
            } catch(e) {}

            return channel;
          },
          __exposedProps__: {
            channel: "r"
          }
        }
      }
    };

    let contentObj = Cu.createObjectIn(aWindow);
    Object.defineProperties(contentObj, mozCNUtilsObj);
    Cu.makeObjectPropsNormal(contentObj);

    aWindow.wrappedJSObject.__defineGetter__("mozCNUtils", function() {
      delete aWindow.wrappedJSObject.mozCNUtils;
      return aWindow.wrappedJSObject.mozCNUtils = contentObj;
    });
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([mozCNUtils]);
