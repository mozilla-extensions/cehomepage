var mozCNNTabSync = (function() {
  let url = "chrome://ntab/locale/sync.properties";
  let bundle = Services.strings.createBundle(url);

  // this cannot be done with an overlay, sigh
  let qs = document.querySelector.bind(document);
  let paneSync = qs('#paneSync');

  let onPaneLoad = function(aEvt) {
    aEvt.target.removeEventListener(aEvt.type, onPaneLoad);
    let parentVBox = qs("#fxaSyncEngines > vbox");
    let checkbox = qs('checkbox[preference="engine.mozcn.ntab"]');
    if (!parentVBox) {
      return;
    }

    if (checkbox) {
      parentVBox.appendChild(checkbox.cloneNode());
    } else {
      checkbox = document.createElement("checkbox");
      checkbox.setAttribute("label",
        bundle.GetStringFromName("engine.mozcn.ntab.label"));
      checkbox.setAttribute("accesskey",
        bundle.GetStringFromName("engine.mozcn.ntab.accesskey"));
      checkbox.setAttribute("preference", "engine.mozcn.ntab");
      checkbox.setAttribute("onsynctopreference",
        "return mozCNNTabSync.onSyncToEnablePref(this);");
      parentVBox.appendChild(checkbox);
    }

    let preference = document.createElement("preference");
    preference.id = "engine.mozcn.ntab";
    preference.setAttribute("name", "services.sync.engine.mozcn.ntab");
    preference.setAttribute("type", "bool");
    qs("#syncEnginePrefs").appendChild(preference);
  };

  if (paneSync) {
    paneSync.addEventListener('paneload', onPaneLoad, false);
  } else {
    window.addEventListener('DOMContentLoaded', onPaneLoad, false);
  }

  // prompt for confirmation for every false => true change
  let message = bundle.GetStringFromName("ntabsync.notification.message");
  let title = bundle.GetStringFromName("ntabsync.notification.title");

  let onSyncToEnablePref = function(aCheckbox) {
    if (!aCheckbox.checked) {
      if (window.mozCNSyncHack && mozCNSyncHack.onSyncToEnablePref) {
        return mozCNSyncHack.onSyncToEnablePref(aCheckbox);
      } else {
        return undefined;
      }
    }
    let shouldEnable = Services.prompt.confirm(window, title, message);

    if (!shouldEnable) {
      aCheckbox.checked = false;
    }
  };

  return { onSyncToEnablePref: onSyncToEnablePref };
})();
