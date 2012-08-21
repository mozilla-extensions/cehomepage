let Cc = Components.classes;
let Ci = Components.interfaces;
let Cr = Components.results;
let Cu = Components.utils;

Cu.import('resource://ntab/FrameStorage.jsm');
Cu.import('resource://ntab/PageThumbs.jsm');
Cu.import('resource://ntab/quickdial.jsm');
Cu.import('resource://ntab/session.jsm');

/* RemoteTabViewer from about:sync-tabs */
let RelatedTabViewer = {
  _tabsList: null,

  init: function RelatedTabViewer_init() {
    this._tabsList = document.querySelector("#related-tabs > dl");

    this.buildList();
  },

  buildList: function RelatedTabViewer_buildList() {
    let sessiontabs = session.query(10);
    let list = this._tabsList;

    let count = list.childElementCount;
    if (count > 0) {
      for (let i = count - 1; i >= 0; i--)
        list.removeChild(list.lastElementChild);
    }

    let section = this.createItem({
      type: 'section',
      class: '',
      sectionName: _('ntab.dial.label.lastvisitedsites')
    });
    list.appendChild(section);
    sessiontabs.forEach(function({title, url}) {
      let attrs = {
        type:  "tab",
        title: title || url,
        url:   url
      }
      let tab = this.createItem(attrs);
      list.appendChild(tab);
    }, this);
  },

  createItem: function RelatedTabViewer_createItem(attrs) {
    let item = null;
    if (attrs["type"] == "tab") {
      item = document.createElement("dd");
      let checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.setAttribute("data-url", attrs.url);
      item.appendChild(checkbox);
      let anchor = document.createElement("a");
      anchor.href = attrs.url;
      anchor.textContent = attrs.title;
      anchor.title = attrs.url;
      anchor.setAttribute("target", "_blank");
      item.appendChild(anchor);
    } else {
      item = document.createElement("dt");
      item.className = attrs.class;
      item.textContent = attrs.sectionName;
    }

    return item;
  }
}

let Utils = {
  get prefs() {
    delete this.prefs;
    return this.prefs = Cc["@mozilla.org/preferences-service;1"].
      getService(Ci.nsIPrefService).
      QueryInterface(Ci.nsIPrefBranch2);
  },
  get chromeWindow() {
    delete this.chromeWindow;
    return this.chromeWindow = getChromeWindow();
  },
  get ioService() {
    delete this.ioService;
    return this.ioService = Cc['@mozilla.org/network/io-service;1'].
      getService(Ci.nsIIOService);
  },
  get shellService() {
    let ss = null;
    try {
      ss = Cc["@mozilla.org/browser/shell-service;1"].
        getService(Ci.nsIShellService);
    } catch(e) {}
    delete this.shellService;
    return this.shellService = ss;
  }
};

let DefaultBrowser = {
  get isDefaultBrowser() {
    return Utils.shellService ?
      Utils.shellService.isDefaultBrowser(true) :
      true;
  },
  get setDefault() {
    delete this.setDefault;
    return this.setDefault = document.querySelector('#setdefault');
  },
  init: function DefaultBrowser_init() {
    if (this.isDefaultBrowser) {
      this.setDefault.setAttribute('hidden', 'true');
    } else {
      let self = this;
      this.setDefault.addEventListener('click', function() {
        self.setAsDefault()
      }, false);
    }
  },
  setAsDefault: function DefaultBrowser_setAsDefault() {
    if (Utils.shellService) {
      Utils.shellService.setDefaultBrowser(true, false);
      this.setDefault.setAttribute('hidden', 'true');
    }
  },
};

let Grid = {
  get thumbSize() {
    let thumbSize = '';
    try {
      thumbSize = Utils.prefs.getCharPref('moa.ntab.dial.thumbsize')
    } catch(e) {}
    if (['', 's', 'm', 'l'].indexOf(thumbSize) == -1) {
      thumbSize = '';
    }
    return thumbSize;
  },
  set thumbSize(aSize) {
    if (aSize == '') {
      this.gridSize = { col: 4, row: 2 };
    }
    Utils.prefs.setCharPref('moa.ntab.dial.thumbsize', aSize);
  },
  get gridSize() {
    let col = 4;
    let row = 2;
    try {
      col = Utils.prefs.getIntPref('moa.ntab.dial.column');
      row = Utils.prefs.getIntPref('moa.ntab.dial.row');
    } catch(e) {}
    col = Math.max(3, Math.min(col, 6));
    row = Math.max(2, Math.min(row, 4));
    return {
      'col': col,
      'row': row
    }
  },
  set gridSize(aSize) {
    Utils.prefs.setIntPref('moa.ntab.dial.column', aSize.col);
    Utils.prefs.setIntPref('moa.ntab.dial.row', aSize.row);
  },
  get gridContainer() {
    delete this.gridContainer;
    return this.gridContainer = document.querySelector('#grid');
  },
  _editGridItem: function Grid__editGridItem(aIndex) {
    let dial = quickDialModule.getDial(aIndex);
    Overlay.overlay.style.display = 'block';
    Overlay.overlay.setAttribute('data-index', aIndex);
    let prompt = Overlay.overlay.querySelector('#prompt');
    if (!prompt.getAttribute('src')) {
      let self = this;
      prompt.addEventListener('load', function() {
        Overlay.init();
      }, false);
      prompt.setAttribute('src', FrameStorage.frames('edit.html'));
    }
  },
  _eventInit: function Grid__eventInit(aLi) {
    let self = this;
    let index = aLi.getAttribute('data-index');
    let button = aLi.querySelectorAll('button');
    let title = aLi.querySelector('span.title').textContent;
    if (button.length) {
      button[0].addEventListener('click', function(evt) {
        self._editGridItem(index);
      }, false);
      button[1].addEventListener('click', function(evt) {
        if (confirm(_('ntab.dial.delConfirmMsg', [title]))) {
          quickDialModule.removeDial(index);
        }
      }, false);
    }
    aLi.querySelector('a').addEventListener('click', function(evt) {
      if (evt.currentTarget.href) {
        let fid = aLi.getAttribute('data-fid');
        tracker.track({ type: 'quickdial', action: 'click', fid: fid, sid: index });
      } else {
        self._editGridItem(index);
      }
    }, false);
    aLi.addEventListener('dragstart', function(evt) {
      evt.dataTransfer.mozSetDataAt('application/x-moz-node', evt.currentTarget, 0);
    }, false);
    aLi.addEventListener('dragover', function(evt) {
      evt.preventDefault();
    }, false);
    aLi.addEventListener('dragenter', function(evt) {
      if (evt.dataTransfer.types.contains('application/x-moz-node')) {
        evt.preventDefault();
      }
    }, false);
    aLi.addEventListener('drop', function(evt) {
      evt.preventDefault();
      let node = evt.dataTransfer.mozGetDataAt('application/x-moz-node', 0);
      if (node.getAttribute('data-index') == index) {
        return;
      }
      quickDialModule.exchangeDial(node.getAttribute('data-index'), index);
    }, false);
  },
  _createGridItem: function Grid__createGridItem(aIndex) {
    let dial = quickDialModule.getDial(aIndex);

    let li = document.createElement('li');
    li.setAttribute('draggable', dial ? 'true' : 'false');
    li.setAttribute('data-index', aIndex);
    li.setAttribute('data-fid', dial ? dial.defaultposition : '');
    li.setAttribute('title', dial ? dial.title || '' : _('ntab.dial.label.clicktoadddial'));

    if (dial) {
      let edit = document.createElement('button');
      edit.setAttribute('title', _('ntab.dial.label.edit'));
      li.appendChild(edit);
      let remove = document.createElement('button');
      remove.setAttribute('title', _('ntab.dial.label.del'));
      li.appendChild(remove);
    }

    let a = document.createElement('a');
    a.setAttribute('draggable', 'false');
    a.setAttribute('href', dial ? dial.url : '');
    a.setAttribute('target', '_blank');

    let span_thumb = document.createElement('span');
    span_thumb.className = 'thumb';
    span_thumb.style.backgroundImage = dial ? 'url(' + (dial.thumbnail ? dial.thumbnail : (PageThumbs.getThumbnailURL(dial.url) + '&ts=' + Date.now())) + ')' : '';
    span_thumb.style.backgroundPosition = dial ? (PageThumbs.getThumbnailType(dial.url) == 'snapshot' ? 'left top' : 'center center') : '';
    a.appendChild(span_thumb);

    let span_title = document.createElement('span');
    span_title.className = 'title';
    span_title.textContent = dial ? dial.title || '' : '';
    a.appendChild(span_title);

    li.appendChild(a);
    this._eventInit(li);

    return li;
  },
  _createGrid: function Grid__createGrid() {
    let thumbSize = this.thumbSize;
    let gridSize = this.gridSize;

    let total = 12;
    let className_ = ''
    if (thumbSize) {
      this.gridContainer.className = thumbSize + '-thumb r' + gridSize.row + ' c' + gridSize.col;
      total = gridSize.col * gridSize.row;
    } else {
      this.gridContainer.className = '';
    }

    let ul = document.createElement('ul');
    for (let i = 1; i <= total; i++) {
      let gridItem = this._createGridItem(i);
      ul.appendChild(gridItem);
    }
    return ul;
  },
  _updateSettingsDisplay: function Grid__updateSettingsDisplay() {
    let thumbSize = this.thumbSize;
    let className_ = thumbSize ? 'customize' : '';
    document.querySelector('#qd-settings > label > input[value="' + className_ + '"]').checked = 'checked';
    document.querySelector('#qd-settings').className = className_;
    document.getElementById('thumb_size').value = this.thumbSize;
    document.getElementById('row_num').value = this.gridSize.row;
    document.getElementById('col_num').value = this.gridSize.col;
  },
  /* new installation should default to responsive, only guess thumbsize for
     old users who have customized column or row counts. */
  _guessThumbSize: function Grid__guessThumbSize() {
    if (!(Utils.prefs.prefHasUserValue('moa.ntab.dial.column') ||
          Utils.prefs.prefHasUserValue('moa.ntab.dial.row'))) {
      return;
    }
    height = Math.round(window.screen.availHeight);
    /* estimated chrome height, top/bottom element */
    height -= (120 + 110 + 50);
    /* height for s/m/l thumb is 110, 165, 220 with 10 * 2 margin */
    let maxRow = {
      's': Math.min(Math.floor(height / (110 + 20)), 4),
      'm': Math.min(Math.floor(height / (165 + 20)), 4),
      'l': Math.min(Math.floor(height / (220 + 20)), 4)
    };
    width = Math.round(window.screen.availWidth);
    if (width >= 1920) {
      /* 2x max prev/next width */
      width -= 200;
    } else {
      width *= (86 / 96);
    }
    /* width for s/m/l thumb is 180, 270, 360 with 10 * 2 margin */
    let maxCol = {
      's': Math.min(Math.floor(width / (180 + 20)), 6),
      'm': Math.min(Math.floor(width / (270 + 20)), 6),
      'l': Math.min(Math.floor(width / (360 + 20)), 6)
    };
    let origCol = 4;
    let origRow = 2;
    try {
      origCol = Utils.prefs.getIntPref('moa.ntab.dial.column');
      origRow = Utils.prefs.getIntPref('moa.ntab.dial.row');
    } catch(e) {}
    let size = 's';
    let col = 6;
    let row = 4;
    ['s', 'm', 'l'].forEach(function(aSize) {
      if (origRow <= maxRow[aSize] && origCol <= maxCol[aSize]) {
        size = aSize;
        col = Math.max(origCol, 3);
        row = Math.max(origRow, 2);
      }
    });
    /* maybe if size/col/row is unchanged ?
    origRow = Math.ceil(origCol * origRow / maxCol['s']);
    origCol = maxCol['s'];
    ['s', 'm', 'l'].forEach(function(aSize) {
      if (origRow <= maxRow[aSize] && origCol <= maxCol[aSize]) {
        size = aSize;
        col = Math.max(origCol, 3);
        row = Math.max(origRow, 2);
      }
    });
    */
    Utils.prefs.setIntPref('moa.ntab.dial.column', col);
    Utils.prefs.setIntPref('moa.ntab.dial.row', row);
    Utils.prefs.setCharPref('moa.ntab.dial.thumbsize', size);
  },
  /* remove defaults 8-11 for users with responsive layout and screen height
     only enough for two rows */
  _removeExtraDefaults: function Grid__removeExtraDefaults() {
    if (Utils.prefs.prefHasUserValue('moa.ntab.dial.column') ||
        Utils.prefs.prefHasUserValue('moa.ntab.dial.row') ||
        Utils.prefs.prefHasUserValue('moa.ntab.dial.thumbsize')) {
      return;
    }
    if (window.matchMedia('(max-height: 750px)').matches) {
      let defaultData = JSON.parse(quickDialModule.getDefaultDataStr());
      [8, 9, 10, 11].forEach(function(aIndex) {
        let defaultDataItem = defaultData[aIndex];
        let currentDataItem = quickDialModule.getDial(aIndex);
        if (defaultDataItem && currentDataItem &&
            defaultDataItem.url == currentDataItem.url) {
          quickDialModule.removeDial(aIndex);
        }
      });
    }
  },
  _migrate: function Grid__migrate() {
    let prefKey = 'moa.ntab.gridview.version';
    let oldVer = 1;
    try {
      oldVer = Utils.prefs.getIntPref(prefKey);
    } catch(e) {}
    switch (oldVer) {
      case 1:
        this._guessThumbSize();
        this._removeExtraDefaults();
      //  no break here, run every updates;
      //case 2:
      //  later update;
    }
    Utils.prefs.setIntPref(prefKey, 2);
  },
  init: function Grid_init() {
    this._migrate();
    this.update();
  },
  update: function Grid_update() {
    this._updateSettingsDisplay();
    let oldGrid = this.gridContainer.querySelector('ul');
    let newGrid = this._createGrid();
    if (oldGrid) {
      this.gridContainer.replaceChild(newGrid, oldGrid);
    } else {
      this.gridContainer.appendChild(newGrid);
    }
  },
  updateGridItem: function Grid_updateGridItem(aIndex) {
    let newItem = this._createGridItem(aIndex);
    let oldItem = document.querySelector('li[data-index="' + aIndex + '"]');
    if (oldItem) {
      oldItem.parentNode.replaceChild(newItem, oldItem);
    }
  },
};

let Background = {
  get backgroundColor() {
    return Utils.prefs.getCharPref('moa.ntab.backgroundcolor');
  },
  set backgroundColor(aColor) {
    Utils.prefs.setCharPref('moa.ntab.backgroundcolor', aColor);
    if (aColor) {
      this.backgroundImage = '';
    }
  },
  get backgroundImage() {
    return Utils.prefs.getCharPref('moa.ntab.backgroundimage');
  },
  set backgroundImage(aImage) {
    Utils.prefs.setCharPref('moa.ntab.backgroundimage', aImage);
    if (aImage) {
      this.backgroundColor = '';
    }
  },
  init: function Background_init() {
    this.update();
  },
  update: function Background_update() {
    let color = this.backgroundColor;
    let image = this.backgroundImage;

    NTab.body.style.backgroundImage = image ? 'url("' + image + '")' : '';
    NTab.body.style.backgroundSize = image ? 'cover' : '';
    NTab.body.style.backgroundColor = color;

    QDTabs.quickDial.className = '';
    if (color) {
      let shouldCheck = document.querySelector('#bgcolor-radio > label > input[value="' + color + '"]');
      if (shouldCheck) {
        shouldCheck.checked = 'checked';
        QDTabs.quickDial.className = 'color';
      }
    } else {
      let checked_ = document.querySelector('#bgcolor-radio > label > input:checked');
      if (checked_) {
        checked_.checked = '';
      }
    }
    document.querySelector('input[name="bgimage"]').value = image;
  },
};

let Footer = {
  get displayFooter() {
    return Utils.prefs.getBoolPref('moa.ntab.displayfooter');
  },
  set displayFooter(aDisplay) {
    Utils.prefs.setBoolPref('moa.ntab.displayfooter', aDisplay);
  },
  get footer() {
    delete this.footer;
    return this.footer = document.querySelector('footer');
  },
  get toggle() {
    delete this.toggle;
    return this.toggle = document.querySelector('#toggle');
  },
  init: function Footer__init() {
    let self = this;
    this.toggle.addEventListener('click', function(evt) {
      self.displayFooter = !self.displayFooter;
    }, false);
    this.update();
  },
  update: function Footer_update() {
    if (this.displayFooter) {
      this.footer.classList.remove('off');
    } else {
      this.footer.classList.add('off');
    }
  },
};

let QDTabs = {
  get currentTab() {
    let tab = 'grid';
    try {
      tab = Utils.prefs.getCharPref('moa.ntab.qdtab');
    } catch(e) {}
    if (['grid', 'site'].indexOf(tab) == -1) {
      tab = 'grid';
    }
    tracker.track({ type: 'qdtab', action: 'load', sid: tab });
    return tab;
  },
  set currentTab(aTab) {
    Utils.prefs.setCharPref('moa.ntab.qdtab', aTab);
    Utils.prefs.setBoolPref('moa.ntab.qdtab.used', true);
    tracker.track({ type: 'qdtab', action: 'switch', sid: aTab });
  },
  get quickDial() {
    delete this.quickDial;
    return this.quickDial = document.querySelector('#quickdial');
  },
  get prev() {
    delete this.prev;
    return this.prev = document.querySelector('#prevtab');
  },
  get qdTabPanels() {
    delete this.qdTabPanels;
    return this.qdTabPanels = document.querySelector('#quick_dial_tabpanels');
  },
  get qdTabs() {
    delete this.qdTabs;
    return this.qdTabs = document.querySelector('#quick_dial_tabs');
  },
  init: function QDTabs_init() {
    let self = this;
    /* see https://developer.mozilla.org/en-US/docs/DOM/NodeList#Workarounds
       for usage of [].forEach.call */
    [].forEach.call(document.querySelectorAll('#quick_dial_tabs > a'), function(anchor) {
      anchor.addEventListener('click', function(evt) {
        self.currentTab = evt.target.getAttribute('data-tab');
      }, false);
    });
    this.update();
    document.querySelector('#prevtab').addEventListener('click', function(evt) {
      let currentTab = self.qdTabPanels.className;
      let prevTab = document.getElementById(currentTab).previousElementSibling;
      if (prevTab) {
        self.currentTab = prevTab.id;
      }
    }, false);
    document.querySelector('#nexttab').addEventListener('click', function(evt) {
      let currentTab = self.qdTabPanels.className;
      let nextTab = document.getElementById(currentTab).nextElementSibling;
      if (nextTab) {
        self.currentTab = nextTab.id;
      }
    }, false);
  },
  update: function QDTabs_update() {
    let tab = this.currentTab;
    this.qdTabPanels.className = tab;
    this.qdTabs.className = tab;
    //hack for lack of reverse adjacent selector
    this.prev.className = tab;
    let iframes = document.getElementById(tab).querySelectorAll('iframe');
    if (iframes.length && iframes[0] && !iframes[0].getAttribute('src')) {
      iframes[0].setAttribute('src', FrameStorage.frames([tab, 'html'].join('.')));
    }
    if (iframes.length && iframes[1] && !iframes[1].getAttribute('src')) {
      iframes[1].setAttribute('src', FrameStorage.frames([tab + '-l', 'html'].join('.')));
    }
  },
};

let Overlay = {
  get overlay() {
    delete this.overlay;
    return this.overlay = document.querySelector('#overlay');
  },
  get prompt() {
    delete this.prompt;
    return this.prompt = document.querySelector('#prompt').contentDocument;
  },
  _inited: false,
  init: function Overlay_init() {
    if (this._inited) {
      return;
    }
    let self = this;
    document.querySelector('#prompt-close').addEventListener('click', function(evt) {
      self._finish();
    }, false);
    this.overlay.addEventListener('click', function(evt) {
      if (evt.target == evt.currentTarget) {
        self._finish();
      }
    }, false);
    document.addEventListener('keypress', function(evt) {
      if (evt.keyCode == 27) {
        self._finish();
      };
    }, false);
    try {
      [].forEach.call(this.prompt.querySelectorAll('li > a'), function(anchor) {
        anchor.addEventListener('click', function(evt) {
          evt.preventDefault();
          let title = evt.target.textContent.replace(/\s/g, '');
          let url = evt.target.href;
          self._finish(title, url);
          tracker.track({ type: 'links', action: 'click', sid: title });
        }, false);
      });
      this.prompt.querySelector('#addbtn').addEventListener('click', function(evt) {
        let title = self.prompt.querySelector('#title').value;
        let url = completeURL(self.prompt.querySelector('#url').value);
        self._finish(title, url);
      }, false);
    } catch(e) {}
    this._inited = true;
  },
  _finish: function Overlay__finish(aTitle, aUrl) {
    if (aUrl) {
      let index = this.overlay.getAttribute('data-index');
      quickDialModule.updateDial(index, { url: aUrl, title: aTitle }, false);
    }
    this.overlay.style.display = '';
    this.prompt.querySelector('#title').value = '';
    this.prompt.querySelector('#url').value = '';
  },
};

let Launcher = {
  get launcher() {
    delete this.launcher;
    return this.launcher = document.querySelector('#launcher');
  },
  _relatedtabsInit: function Launcher__relatedtabsInit() {
    let self = this;
    RelatedTabViewer.init();
    document.querySelector('#related-tabs > label > input[type="checkbox"]').addEventListener('change', function(evt) {
      [].forEach.call(document.querySelectorAll('#related-tabs > dl > dd > input[type="checkbox"]'), function(checkbox) {
        checkbox.checked = evt.target.checked;
      });
    }, false);
    document.querySelector('#related-tabs > input[type="button"]').addEventListener('click', function(evt) {
      self.launcher.classList.toggle('related-tabs');
      [].forEach.call(document.querySelectorAll('#related-tabs > dl > dd > input[type="checkbox"]:checked'), function(checkbox) {
        Utils.chromeWindow.openUILinkIn(checkbox.getAttribute('data-url'), 'tab');
        checkbox.checked = false;
      });
      document.querySelector('#related-tabs > label > input[type="checkbox"]').checked = false;
    }, false);
  },
  _toolsInit: function Launcher__toolsInit() {
    let self = this;
    [].forEach.call(document.querySelectorAll('#tools > li'), function(li) {
      li.addEventListener('click', function(evt) {
        self.launcher.classList.toggle('tools');
        switch(evt.currentTarget.id) {
          case 'downloads':
            Utils.chromeWindow.BrowserDownloadsUI();
            break;
          case 'bookmarks':
            Utils.chromeWindow.PlacesCommandHook.showPlacesOrganizer("AllBookmarks");
            break;
          case 'history':
            Utils.chromeWindow.PlacesCommandHook.showPlacesOrganizer("History");
            break;
          case 'apps':
            Utils.chromeWindow.openUILinkIn("https://marketplace.mozilla.org/", "tab");
            break;
          case 'addons':
            Utils.chromeWindow.BrowserOpenAddonsMgr();
            break;
          case 'sync':
            Utils.chromeWindow.openPreferences("paneSync");
            break;
          case 'settings':
            Utils.chromeWindow.openPreferences();
            break;
        }
        tracker.track({ type: 'tools', action: 'click', sid: evt.currentTarget.id });
      }, false);
    });
  },
  _settingsInit: function Launcher__settingsInit() {
    [].forEach.call(document.querySelectorAll('input[name="quickdial"]'), function(input) {
      input.addEventListener('click', function(evt) {
        document.querySelector('#qd-settings').className = evt.target.value;
        if (evt.target.value) {
          Grid.thumbSize = 'm';
          QDTabs.currentTab = 'grid';
        } else {
          Grid.thumbSize = '';
        }
      }, false);
    });
    [].forEach.call(document.querySelectorAll('select'), function(select) {
      select.addEventListener('change', function(evt) {
        switch(evt.currentTarget.id) {
          case 'row_num':
          case 'col_num':
            Grid.gridSize = {
              row: parseInt(document.getElementById('row_num').value, 10),
              col: parseInt(document.getElementById('col_num').value, 10)
            };
            break;
          case 'thumb_size':
            Grid.thumbSize = document.getElementById('thumb_size').value;
            break;
        }
      }, false);
    });
    [].forEach.call(document.querySelectorAll('#bgcolor-radio > label > input[name="bgcolor"]'), function(input) {
      input.addEventListener('click', function(evt) {
        Background.backgroundColor = evt.target.value;
      }, false);
    });
    document.querySelector('input[name="bgimage"]').addEventListener('change', function(evt) {
      let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
      file.initWithPath(evt.target.value);
      Background.backgroundImage = Utils.ioService.newFileURI(file).spec;
    }, false);
    [].forEach.call(document.querySelectorAll('#page-settings > fieldset > div > input[type="button"]'), function(input) {
      input.addEventListener('click', function(evt) {
        switch(evt.target.id) {
          case 'bgreset':
            Background.backgroundColor = 'transparent';
            break;
          case 'resetpref':
            Utils.prefs.getChildList('moa.ntab.').forEach(function(aPref) {
              Utils.prefs.clearUserPref(aPref);
            });
            break;
          case 'feedback':
            Utils.chromeWindow.openUILinkIn('http://www.huohu123.com:8080/generate/channel/feedback_i.php', 'tab');
            break;
        }
      }, false);
    });
  },
  init: function Launcher_init() {
    let self = this;
    [].forEach.call(document.querySelectorAll('#launcher > li'), function(li) {
      li.addEventListener('click', function(evt) {
        let menu = evt.target.getAttribute('data-menu');
        if (menu) {
          self.launcher.classList.toggle(menu);
          if (self.launcher.classList.length) {
            self.launcher.className = menu;
          }
          tracker.track({ type: 'menu', action: 'click', sid: menu });
        }
        evt.stopPropagation();
      }, false);
    });
    document.addEventListener('click', function(evt) {
      self.launcher.className = '';
    }, false);
    document.addEventListener('keypress', function(evt) {
      if (evt.keyCode == 27) {
        self.launcher.className = '';
      };
    }, false);
    this._relatedtabsInit();
    this._toolsInit();
    this._settingsInit();
  },
};

let NTab = {
  observer: {
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
          case 'moa.ntab.view':
            NTab.update();
            break;
          case 'moa.ntab.qdtab':
            QDTabs.update();
            break;
          case 'moa.ntab.dial.thumbsize':
          case 'moa.ntab.dial.column':
          case 'moa.ntab.dial.row':
            Grid.update();
            break;
          case 'moa.ntab.backgroundcolor':
          case 'moa.ntab.backgroundimage':
            Background.update();
            break;
          case 'moa.ntab.displayfooter':
            Footer.update();
            break;
        }
        let itemPrefix = 'moa.ntab.dial.update.';
        if (aData.indexOf(itemPrefix) == 0) {
          let index = aData.substring(itemPrefix.length);
          Grid.updateGridItem(index);
        }
      }
    }
  },
  get currentPane() {
    let pane = 'quickdial';
    try {
      pane = Utils.prefs.getCharPref('moa.ntab.view');
    } catch(e) {}
    if (['nav', 'quickdial', 'search', 'blank'].indexOf(pane) == -1) {
      pane = 'quickdial';
    }
    tracker.track({ type: 'view', action: 'load', sid: pane });
    return pane;
  },
  set currentPane(aPane) {
    Utils.prefs.setCharPref('moa.ntab.view', aPane);
    tracker.track({ type: 'view', action: 'switch', sid: aPane });
  },

  get body() {
    delete this.body;
    return this.body = document.body;
  },
  _paneInit: function Ntab__paneInit() {
    let self = this;
    [].forEach.call(document.querySelectorAll('#navpane > a'), function(anchor) {
      anchor.addEventListener('click', function(evt) {
        self.currentPane = evt.target.getAttribute('data-pane');
      }, false);
    });
    this.update();
  },
  _observerInit: function NTab__observerInit() {
    Utils.prefs.addObserver('moa.ntab.', this.observer, true);
  },
  _observerUninit: function NTab__observerUninit() {
    Utils.prefs.removeObserver('moa.ntab.', this.observer, true);
  },

  handleEvent: function NTab_handle(evt) {
    switch(evt.type) {
      case 'DOMContentLoaded':
        this.init();
        break;
      case 'unload':
        this.uninit();
        break;
    }
  },
  init: function NTab_init() {
    //display first, then action
    Background.init();
    Grid.init();
    QDTabs.init();
    this._paneInit();
    this._observerInit();
    Footer.init();
    Launcher.init();
    DefaultBrowser.init();
  },
  uninit: function NTab_uninit() {
    this._observerUninit();
  },
  update: function NTab_updatePane() {
    let pane = this.currentPane;
    this.body.className = pane;
    let iframe = document.getElementById(pane).querySelector('iframe');
    if (iframe && !iframe.getAttribute('src')) {
      let srcPrefKey = ['moa.ntab.view', pane, 'url'].join('.');
      iframe.setAttribute('src', Utils.prefs.getCharPref(srcPrefKey));
    }
  },
};
window.addEventListener('DOMContentLoaded', NTab, false);
window.addEventListener('unload', NTab, false);
