(function() {
  let getPref = Cu.import("resource://ntab/mozCNUtils.jsm", {}).getPref;
  /**
   * Pref browser.startup.homepage have been set to "about:cehome" in the pref.js
   * And in distribution.ini, browser.startup.homepage is set to http://i.firefoxchina.cn.
   *
   * Before version 0.8.9, users' pref may have been set to about:cehome because of bug 151.
   * To make sure users' homepage could also be displayed normally even if the addon is disabled,
   * check pref to see if it is about:cehome, then restore the pref.
   */
  function resetHomepageIfPossible() {
    // in china edition, pref "browser.startup.homepage" is a locale string, has mimo type,
    // so must use  getLocale() other than get()
    // see in distribution.ini
    var homepage = getPref("browser.startup.homepage", "", Ci.nsIPrefLocalizedString);
    if ("about:cehome" == homepage) {
      Services.prefs.clearUserPref("browser.startup.homepage");
    }
  }

  function cehomepage_autoSetHomepage() {
    var homepage = getPref("extensions.cehomepage.homepage", "about:cehome", Ci.nsIPrefLocalizedString);
    Services.prefs.setCharPref("browser.startup.homepage", homepage);
  }

  var addonlistener = {
    onUninstalling: function (addon) {
      cancelAboutProtocol(addon);
    },

    onDisabling: function (addon) {
      cancelAboutProtocol(addon);
    },

    onOperationCancelled: function(addon) {
      if(addon.id == "cehomepage@mozillaonline.com") {
        var homepage = getPref("browser.startup.homepage", "", Ci.nsIPrefLocalizedString);
        var abouturl = getPref("extensions.cehomepage.abouturl", "http://i.firefoxchina.cn/", Ci.nsIPrefLocalizedString);
        var urls = homepage.split("|");
        for (var i = 0; i < urls.length; i++){
          urls[i] = urls[i].trim() == abouturl ? "about:cehome" : urls[i].trim();
        }
        homepage = urls.join("|");
        Services.prefs.setCharPref("browser.startup.homepage", homepage);
      }
    }
  };

  function cancelAboutProtocol(addon) {
    if(addon.id == "cehomepage@mozillaonline.com") {
      var homepage = getPref("browser.startup.homepage", "", Ci.nsIPrefLocalizedString);
      var abouturl = getPref("extensions.cehomepage.abouturl", "http://i.firefoxchina.cn/", Ci.nsIPrefLocalizedString);
      homepage = homepage.replace(/about:cehome/ig, abouturl);
      Services.prefs.setCharPref("browser.startup.homepage", homepage);
      for (var j = 0; j < gBrowser.tabs.length; j++) {
        if (gBrowser.getBrowserAtIndex(j).contentWindow.document.location == "about:cehome") {
          gBrowser.getBrowserAtIndex(j).contentWindow.document.location = abouturl;
        }
      }
    }
  }

  window.addEventListener('load', function() {
    window.setTimeout(function(evt) {
      resetHomepageIfPossible();

      // the following lines added for z.g-fox.cn, on first install of the addon, set z.g-fox.cn to homepage
      var autoSetHomepage = getPref("extensions.cehomepage.autoSetHomepage", false);
      if (autoSetHomepage) {
        if (Application.getExtensions) {
          // Application.extensions is obsolete in Gecko 2.0
          Application.getExtensions(function(exts) {
            if (exts.get("cehomepage@mozillaonline.com").firstRun) {
              cehomepage_autoSetHomepage();
            }
          });
        }
      }

      /**
       * The distribution.ini of the old users may still remians the cehomepage pref as "about:cehome"
       * Still need to keep the addon listener.
       */
      AddonManager.addAddonListener(addonlistener);
      window.addEventListener('unload', function(evt) {
        AddonManager.removeAddonListener(addonlistener);
      }, false);
    }, 10);
  }, false);
}());
