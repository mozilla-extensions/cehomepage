(function() {
	var ns = MOA.ns('NTab');
	
	var gPref = Components.classes["@mozilla.org/preferences-service;1"]
               .getService(Components.interfaces.nsIPrefService)
               .QueryInterface(Components.interfaces.nsIPrefBranch2);
    
    var _url = 'about:ntab';
	Components.utils['import']('resource://ntab/quickdial.jsm');
    
	function loadInExistingTabs() {
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
	
	function doFocus() {
		if (gURLBar) {
			setTimeout(function() {
				gURLBar.focus();
			}, 0);
		}
	}

	ns.browserOpenTab = function(event) {
		if (gPref.getBoolPref('moa.ntab.openInNewTab')) {
			var newTab = gBrowser.addTab(_url);
			gBrowser.selectedTab = newTab;
			// empty user typed value.
			newTab.linkedBrowser.userTypedValue = '';
			// focus address bar
			doFocus();								
		} else {
			window.originalBrowserOpenTab(event);
		}
	};
	
	ns.onLoad = function() {
		// load ntab page in existing empty tabs.
		loadInExistingTabs();

		// Catch new tab
		if (window.TMP_BrowserOpenTab) {
			gBrowser.removeEventListener('NewTab', window.TMP_BrowserOpenTab, true);
			window.originalBrowserOpenTab = window.TMP_BrowserOpenTab;
			window.TMP_BrowserOpenTab = MOA.NTab.browserOpenTab;
			gBrowser.addEventListener('NewTab', window.TMP_BrowserOpenTab, true);
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
	};
	
	ns.onPageLoad = function(e) {
		// MOA.debug('loaded.');
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
		while (true) {
			if (document.body == elem)
				break;
				
			if (elem.className && elem.className.indexOf('quick-dial-item') > -1) {
				num = /item-(\d+)/.exec(elem.id)[1];
				break;
			}
			
			elem = elem.parentNode;
		}
		
		return num;
	}
	
	var _num = -1;
	ns.onContextCommand = function(event, menuid) {
		switch (menuid) {
			case 'nt-refresh':
				content.wrappedJSObject.quickDial.refreshDial(_num);
				break;
			case 'nt-refreshall':
				content.wrappedJSObject.quickDial.refreshAll(_num);
				break;
			case 'nt-edit':
				content.wrappedJSObject.quickDial.editDial(_num);
				break;
			case 'nt-linkopenmodel':
				gPref.setBoolPref('moa.ntab.openLinkInNewTab', !gPref.getBoolPref('moa.ntab.openLinkInNewTab'));
				break;
			case 'nt-switchview':
				gPref.setCharPref('moa.ntab.view', event.target.value);
				break;
			case 'nt-changebg':
				content.wrappedJSObject.custom.pickImage();
				break;
			case 'nt-clearbg':
				content.wrappedJSObject.custom.clearBgImage();
				break;
		}
	};
	
	ns.onContextMenu = function(event) {
		_num = getDialNum(event.target);
		if (_num < 0) {
			if (event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLAnchorElement) {
				return;
			}
		}
		
		document.getElementById('nt-linkopenmodel').setAttribute("checked", gPref.getBoolPref('moa.ntab.openLinkInNewTab'));
		document.getElementById('nt-refresh').hidden = _num < 0;
		document.getElementById('nt-edit').hidden = _num < 0;
		document.getElementById('nt-refreshall').hidden = gPref.getCharPref('moa.ntab.view') !== 'quickdial';
		document.getElementById('nt-clearbg').hidden = gPref.getCharPref('moa.ntab.backgroundimage') === '';
		
		var viewswitcher = document.getElementById('nt-switchview').firstChild;
		var view = gPref.getCharPref('moa.ntab.view');
		for (var i = 0; i < viewswitcher.childNodes.length; i++) {
			if (view == viewswitcher.childNodes[i].value) {
				viewswitcher.childNodes[i].setAttribute('checked', true);
				break;
			}
		}
		document.getElementById('nt-menu').openPopupAtScreen(event.screenX, event.screenY, true);
		event.preventDefault();
	};
})();

window.addEventListener("load", MOA.NTab.onLoad, false);
gBrowser.addEventListener('load', MOA.NTab.onPageLoad, false);
