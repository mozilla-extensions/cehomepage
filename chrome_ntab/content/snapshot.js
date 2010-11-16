(function() {
	// Initial global object
	// This object can be access by: MOA.NTab.Snapshot 
	var snapshot = MOA.ns('NTab.Snapshot');
	
	var Cc = Components.classes;
	var Ci = Components.interfaces;
	
	Components.utils['import']('resource://ntab/utils.jsm');
	Components.utils['import']('resource://ntab/quickdial.jsm');
	Components.utils['import']('resource://ntab/hash.jsm');
	
	// Pre-defined snapshot
	var snapshotMap = {
		'http://www.baidu.com/': 'chrome://ntab/skin/thumb/baidu.png',
		'http://www.baidu.com/index.php?tn=monline_5_dg': 'chrome://ntab/skin/thumb/baidu.png',
		'http://www.renren.com/': 'chrome://ntab/skin/thumb/renren.png',
		'http://www.360buy.com/': 'chrome://ntab/skin/thumb/360.png',
		'http://click.union.360buy.com/JdClick/?unionId=206&siteId=4&to=http://www.360buy.com/': 'chrome://ntab/skin/thumb/360.png',
		'http://www.youku.com/': 'chrome://ntab/skin/thumb/youku.png',
		'http://www.taobao.com/': 'chrome://ntab/skin/thumb/taobao.png',
		'http://pindao.huoban.taobao.com/channel/channelCode.htm?pid=mm_12811289_2324927_9001404': 'chrome://ntab/skin/thumb/taobao.png',
		'http://www.sina.com.cn/': 'chrome://ntab/skin/thumb/sina.png',
	};
	
	/*** Implement methods in snapshot object. ***/
	
	/**
	 * Return the chrome url of snapshot by website url.
	 * If snapshot is not generated yet, return null.
	 * 
	 * @param url
	 * 		url of website, e.g.： http://www.baidu.com
	 * 
	 * @return string
	 * 		return chrome url of snapshot, e.g.: chrome://ntab-profile/snapshot123.png
	 *      If snapshot is not generated yet, return null.
	 * 
	 */
	snapshot.getSnapshotUrl = function(url) {
		if (snapshotMap[url])
			return snapshotMap[url];
			
		var hashName = utils.md5(url);
		var file = utils.getProFile(['ntab', 'cache', hashName]);
		if (!file)
			return '';
		
		var ioService = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService);
		return ioService.newFileURI(file).spec;
	};
	
	/**
	 * Tell snapshot module to create a snapshot for a given url.
	 * 
	 * @param url
	 * 		url of website
	 * 
	 * @return
	 * 		no return.
	 * 		Snapshot module should call function back: MOA.NTab.TabLoader.snapshotDone()
	 */
	snapshot.createSnapshot = function(url) {
		if (snapshotMap[url])
			return;
			
		// Add url to global hash, indicate that the url is under processing.
		hashModule.add(url, true);
		queue.push(url);
		processQueue();
	};
	
	/**
	 * Tell snapshot module to refresh snapshot for a given url.
	 * 
	 * @param url
	 * 		url of website
	 * 
	 * @return
	 * 		no return.
	 */
	snapshot.refreshSnapshot = function(url) {
		this.removeSnapshot(url);
		this.createSnapshot(url);
	};
	
	/**
	 * Tell snapshot module to remove snapshot.
	 * 
	 * @param url
	 * 		url of website
	 * 
	 * @return
	 * 		no return
	 */
	snapshot.removeSnapshot = function(url) {
		utils.removeFile(['ntab', 'cache', utils.md5(url)]);
	};
	
	// Array to store urls
	var queue = [];
	var MAX_CONNECTIONS = 3;
	var snapshots = [];
	var TIMEOUT_LOAD = 30000;
	
	function processQueue() {
		if (snapshots.length >= MAX_CONNECTIONS)
			return;
			
		if (queue.length == 0)
			return;
		
		MOA.debug('Start generate snapshot for url: ' + queue[0]);
		snapshots.push(new NTSnapshot(queue.shift()));
	}
	
	function _snapshotDone(snapshot) {
		MOA.debug('Snapshot is done for url: ' + snapshot.url);
		
		var tmp = [];
		for (var i = 0; i < snapshots.length; i++) {
			if (snapshot == snapshots[i])
				continue;
			tmp.push(snapshots[i]);
		}
		snapshots = tmp;
		processQueue();
		
		MOA.debug('Refresh dial related: ' + snapshot.url);
		// Remove url from global hash, indicate that the snapshot work has been done.
		hashModule.remove(snapshot.url);
		quickDialModule.snapshotDone(snapshot.url);
	}

	var NTSnapshot = function(url) {
		this.initialize(url);
	};
	
	NTSnapshot.prototype = {
		initialize: function(url) {
			this.url = url;
			var self = this;
			setTimeout(function() {
				self.load();
			}, 0);
		},
		
		load: function() {
			MOA.debug('Create hidden browser to load url: ' + this.url);
			this.browser = document.createElement('browser');
			this.browser.width = 1024;
			this.browser.height = 768;
			this.browser.setAttribute('type', 'content');
			document.getElementById('nt-hidden-box').appendChild(this.browser);
			
			var self = this;
			this.loadEvent = function() {
				// FIXME loaded twice.
				// alert(self.browser.contentWindow.document.location);
				MOA.debug('Timeout when loading url: ' + self.url);
				self.onload();
			};
			
			this.timeout = window.setTimeout(function() {
				MOA.debug('Page has been loaded: ' + self.url);
				self.onload();	
			}, TIMEOUT_LOAD);
	
			this.browser.setAttribute('src', this.url);
			this.browser.addEventListener('load', this.loadEvent, true);
		},
		
		onload: function() {
			MOA.debug('Create canvas to draw window: ' + this.url);
			
			window.clearTimeout(this.timeout);
			this.browser.removeEventListener('load', this.loadEvent, true);
			
			function getFavicon(doc) {
				var links = doc.getElementsByTagName('link');
				for (var i = 0; i < links.length; i++) {
					var link = links[i];
					if (/icon/i.test(link.rel)) {
						return link.href;
					}
				}
				
				if (!utils.isLocal(doc.location)) {
					var uri = utils.getNsiURL(doc.location);
					return uri.prePath + '/favicon.ico';
				}
			}
			
			var wnd = this.browser.contentWindow
			var doc = wnd.document;
			
			// update title and favicon
			quickDialModule.updateTitleIfEmpty(this.url, doc.title);
			utils.setFavicon(this.url, getFavicon(doc));
			quickDialModule.updateFavicon(this.url);
			
			// Settimeout to draw thumbnail, make sure that whole page is complete rendered.
			var self = this;
			setTimeout(function() {
				var width = 1024;
				var height = 768;
				
				var canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
				// keep same scale of with / height
				canvas.width = 206;
				canvas.height = height * canvas.width / width;
				
				var context = canvas.getContext('2d');
				context.clearRect(0, 0, canvas.width, canvas.height);
				context.scale(canvas.width / width, 
							canvas.height / height);
				context.save();
				context.drawWindow(wnd, 0, 0, width, height, 'rgb(255,255,255)');
				
				var data = canvas.toDataURL('image/png');
				var ioService = Cc['@mozilla.org/network/io-service;1']
								.getService(Ci.nsIIOService);
				var uri = ioService.newURI(data, 'UTF8', null);
				
				utils.saveURIToProFile(['ntab', 'cache', utils.md5(self.url)], uri, function() {
					MOA.debug('Snapshot image has been saved: ' + self.url);
					_snapshotDone(self);
					self.destroy();			
				});
			}, 1000);
		},
		
		destroy: function() {
			window.clearTimeout(this.timeout);
			if (this.browser) {
				this.browser.removeEventListener('load', this.loadEvent, true);
				if (this.browser.parentNode) {
					this.browser.parentNode.removeChild(this.browser);
				}
				delete this.browser;
			}
		}
	};
	
	window.addEventListener('unload', function(event) {
		while (snapshots.length > 0) {
			var snapshot = snapshots.shift();
			hashModule.remove(snapshot.url);
			snapshot.destroy();
		}
	}, false);
})();