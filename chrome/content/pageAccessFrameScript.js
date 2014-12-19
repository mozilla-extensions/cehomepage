const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');

XPCOMUtils.defineLazyModuleGetter(this, 'Services',
  'resource://gre/modules/Services.jsm');

XPCOMUtils.defineLazyModuleGetter(this, 'NTabDB',
  'resource://ntab/NTabDB.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'Tracking',
  'resource://ntab/Tracking.jsm');

let pageAccess = {
  observe: function(aSubject, aTopic, aData) {
    switch (aTopic) {
      case 'content-document-global-created': {
        this.injectMozCNUtils(aSubject, aData);
        break;
      }
    }
  },

  injectMozCNUtils: function(aWin, aURL) {
    try {
      this.attachToWindow(aWin, aURL);
    } catch(e) {}
  },

  attachToWindow: function(aWin, aURL) {
    let document = aWin.document;
    let docURI = Services.io.newURI(aURL, null, null);

    if ([
      'i.firefoxchina.cn',
      'newtab.firefoxchina.cn',
      'offlintab.firefoxchina.cn'
    ].indexOf(docURI.host) < 0) {
      return;
    }

    aWin.wrappedJSObject.__defineGetter__('mozCNChannel', function() {
      return 'moz_cn_channel';
    });
  }
};

Services.obs.addObserver(pageAccess, 'content-document-global-created', false);
