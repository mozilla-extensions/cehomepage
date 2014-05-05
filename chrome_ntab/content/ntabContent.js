let Cu = Components.utils;
let Ci = Components.interfaces;
let Cc = Components.classes;

let document = content.document;

let DefaultBrowser = {
  get setDefault() {
    delete this.setDefault;
    return this.setDefault = document.querySelector('#setdefault');
  },
  // shellService is not universally available, see https://bugzil.la/297841
  get shellService() {
    let shellService = null;
    try {
      shellService = Cc['@mozilla.org/browser/shell-service;1'].
                       getService(Ci.nsIShellService);
    } catch(e) {}
    delete this.shellService;
    return this.shellService = shellService;
  },
  init: function DefaultBrowser_init() {
    if (!this.setDefault) {
      return;
    }

    if (!this.shellService || this.shellService.isDefaultBrowser(true)) {
      return;
    }

    let self = this;
    this.setDefault.addEventListener('click', function(evt) {
      self.setAsDefault(evt);
    }, false, /** wantsUntrusted */false);
    this.setDefault.removeAttribute('hidden');
  },
  setAsDefault: function DefaultBrowser_setAsDefault(aEvt) {
    if (this.shellService) {
      this.shellService.setDefaultBrowser(true, false);
    }
    this.setDefault.setAttribute('hidden', 'true');
  },
};

let Launcher = {
  get launcher() {
    delete this.launcher;
    return this.launcher = document.querySelector('#launcher');
  },
  get tools() {
    delete this.tools;
    return this.tools = document.querySelector('li[data-menu="tools"]');
  },
  init: function Launcher_init() {
    if (!this.tools) {
      return;
    }

    this.tools.removeAttribute('hidden');

    let self = this;
    [].forEach.call(document.querySelectorAll('#tools > li'), function(li) {
      li.addEventListener('click', function(aEvt) {
        self.launcher.classList.toggle('tools');

        sendAsyncMessage('AboutNTab:' + aEvt.currentTarget.id);

        let evt = new content.CustomEvent("mozCNUtils:Tracking", {
          bubbles: true,
          detail: {
            type: 'tools',
            action: 'click',
            sid: aEvt.currentTarget.id
          }
        });
        content.dispatchEvent(evt);
      }, false, /** wantsUntrusted */false);
    });
  }
}

content.addEventListener('DOMContentLoaded', function() {
  Launcher.init();
  DefaultBrowser.init();
}, false);
