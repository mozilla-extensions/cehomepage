(function() {
	var ns = MOA.ns('NTab');

	var gPref = Components.classes["@mozilla.org/preferences-service;1"]
               .getService(Components.interfaces.nsIPrefService)
               .QueryInterface(Components.interfaces.nsIPrefBranch2);

    var _url = 'about:ntab';
	Components.utils['import']('resource://ntab/quickdial.jsm');

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

			if (elem.hasAttribute('data-index') && parseInt(elem.getAttribute('data-index'), 10) > -1) {
				num = parseInt(elem.getAttribute('data-index'), 10);
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

		document.getElementById('nt-refresh').hidden = _num < 0;
		document.getElementById('nt-edit').hidden = _num < 0;
		document.getElementById('nt-refreshall').hidden = gPref.getCharPref('moa.ntab.view') !== 'quickdial';

		document.getElementById('nt-menu').openPopupAtScreen(event.screenX, event.screenY, true);
		event.preventDefault();
	};

	ns.onKeydown = function(evt) {
		//var selectedDocument = gBrowser.selectedBrowser.contentDocument;
		if (//selectedDocument.URL == _url &&
			gPref.getBoolPref('moa.ntab.display.usehotkey') &&
			evt.ctrlKey && 48 <= evt.keyCode && evt.keyCode <= 57) {
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
