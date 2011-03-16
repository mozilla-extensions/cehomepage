function start() {
	function getService(className, interfaceName) {
	    let componentClass = Components.classes[className];
	    let service = componentClass.getService(Components.interfaces[interfaceName]);
	    return service;
	}
	
    let observerService = getService("@mozilla.org/observer-service;1", "nsIObserverService");
    observerService.addObserver({observe: handleFailDocumentLoad}, "FailDocumentLoad", false);
/*	eval("BrowserReloadWithFlags = " + BrowserReloadWithFlags.toString().replace("var webNav = getWebNavigation();","var webNav = getWebNavigation();\
				if(gBrowser.currentURI && gBrowser.currentURI.spec.indexOf('data:text/html,%3C!--originalUrl') >= 0 && webNav.canGoBack){\
					webNav.goBack();\
				}"));
	alert(BrowserReloadWithFlags);*/

/*	hookProp(gURLBar,"value",null, function(){
		if (arguments[0] && arguments[0].indexOf("data:text/html,<!--originalUrl") == 0){
			arguments[0] = getOriginalUrl(arguments[0]);
		}
	});*/
	
    function handleResponse(channel, topic) {
        channel = channel.QueryInterface(Components.interfaces.nsIHttpChannel);
        if (channel.responseStatus == 404) {
            let url = channel.URI.spec;
            if (!url.match(/.*[?|&]skip-friendly-error$/)) {
                bagOf404s[url] = true;
            }
        }
    }

    function handleDocumentLoad(win, topic) {
        var url = win.location.href;
        if (bagOf404s[url]) {
            delete bagOf404s[url];
            let suggestionJson = getLinkDoctorDataAsJson(url);
            let encodedSuggestionJson = encodeURIComponent(suggestionJson);
            let url404 = "chrome://ceerrorpage/content/404.html?" + encodedSuggestionJson;
            win.location.replace(url404);
        }
    }

	function getlinks(win) {
		var req = new XMLHttpRequest();  
		req.open('GET', 'http://i.g-fox.cn/net_error/portal_links_errorpage.html', true);  

		req.onreadystatechange = function () {  
					if (req.readyState == 4) {  
						if((req.status == 200)) {
							var xmldoc = req.responseText;
								
							var target = win.document.getElementsByName("panel-content")[0];  
							var fragment = Components.classes["@mozilla.org/feed-unescapehtml;1"].getService(Components.interfaces.nsIScriptableUnescapeHTML).parseFragment(xmldoc, false, null, target);  
							if(win.document.getElementById("links_link_1")==null) {
								target.appendChild(fragment);  
							}
							win.document.getElementById("links_link_in").style.display="none";
							win.document.getElementById("links_sign").value="1";				
						}
						else {
							win.document.getElementById("links_link_in").style.display="block";
						}
					}   
				};  
		req.send(null);  
	  
	}

	function get_google_web(win)
	{
		var req = new XMLHttpRequest();
		req.open('GET', 'http://i.g-fox.cn/net_error/google_frame.html', true);

		req.onreadystatechange = function () {  
					if (req.readyState == 4) {  
						if((req.status == 200)) {
							win.document.getElementById("google_page_sign").value = "out";
						}
					}   
				};  
		req.send(null);
	}

	function get_google_js(win)
	{
		var req = new XMLHttpRequest();
		req.open('GET', 'http://pagead2.googlesyndication.com/pagead/show_sdo.js', true);

		req.onreadystatechange = function () {  
				if (req.readyState == 4) {  
					if((req.status == 200)) {
						win.document.getElementById("google_js_sign").value = "out";
				  }
				}   
			  };  
		req.send(null);
	}

	function get_baidu_taobao(win)
	{
		var req = new XMLHttpRequest();  
		req.open('GET', 'http://i.g-fox.cn/', true);  
		req.onreadystatechange = function () {  
				if (req.readyState == 4) {  
					if((req.status == 200)) {
						var xmldoc = req.responseText;
						win.document.getElementById("baidu_taobao_sign").value="out";
						if(win.document.getElementById("radio1").checked == true)
						{
							win.document.getElementsByTagName('form').item(0).setAttribute("action", "http://i.g-fox.cn/se");
						}
						if(win.document.getElementById("radio2").checked == true)
						{
							var temp = win.document.getElementsByTagName('form').item(0).action;
							win.document.getElementsByTagName('form').item(0).setAttribute("action", "http://i.g-fox.cn/se");
						}		
					}
					else {
						win.document.getElementById("baidu_taobao_sign").value="in";
					}
				}  
			  };  
		req.send(null);  
	}
	
	function getTaobao(win){
		var req = new XMLHttpRequest();
		req.open("GET", "chrome://ceerrorpage/content/taobao.html",false);  
		req.send(null);
		
		if (req.status == 0){
			alert("data:text/html," + encodeURIComponent(req.responseText));
			win.document.getElementById("taobao_zhidao_frame").setAttribute("src","data:text/html," + encodeURIComponent(req.responseText));
		}
		
	//	win.document.getElementById('taobao_zhidao_frame').contentWindow.document.contentEditable = true; 	
	//	alert(win.document.getElementById('taobao_zhidao_frame').contentWindow.document.getElementById("search_buttton_taobao").value);
	}
	
	function get_ajax_data(win) {
	//	getTaobao(win);
		getlinks(win);
		if (navigator.onLine){
			get_google_web(win);
			get_google_js(win);
		}
		get_baidu_taobao(win);
	}
	
	function handleFailDocumentLoad(win, topic) {
//		alert(win);
//		var url = gURLBar.value;
	  window.setTimeout(function(){
	 	  var error_pattern = /^about:neterror/;
	 	  if(error_pattern.exec(win.document.documentURI)){
		//		alert("failed");
			get_ajax_data(win);
/* 	  	window.setTimeout(function(){get_ajax_data(win)},2000);
		var errorUrl = win.document.documentURI;
		var req = new XMLHttpRequest();
		req.open("GET", "chrome://ceerrorpage/content/404.html",false);  
		req.send(null);
		alert(req.status);
		if (req.status == 200 || req.status == 0){
			win.location.replace("data:text/html," + encodeURIComponent(req.responseText));
			window.setTimeout(function(){gURLBar.value= url;},0);
		} */
			}
		},500);
	}
	
	/*
	define or change the getter and setter of prop, copied from IE Tab
	*/
	function hookProp(parentNode, propName, myGetter, mySetter){
	  var oGetter = parentNode.__lookupGetter__(propName);
	  var oSetter = parentNode.__lookupSetter__(propName);
	  if (oGetter && myGetter) myGetter = oGetter.toString().replace(/{/, "{"+myGetter.toString().replace(/^.*{/,"").replace(/.*}$/,""));
	  if (oSetter && mySetter) mySetter = oSetter.toString().replace(/{/, "{"+mySetter.toString().replace(/^.*{/,"").replace(/.*}$/,""));
	  if (!myGetter) myGetter = oGetter;
	  if (!mySetter) mySetter = oSetter;
	  if (myGetter) try { eval('parentNode.__defineGetter__(propName, '+ myGetter.toString() +');'); }catch(e){ Components.utils.reportError("Failed to hook property Getter: "+propName); }
	  if (mySetter) try { eval('parentNode.__defineSetter__(propName, '+ mySetter.toString() +');'); }catch(e){ Components.utils.reportError("Failed to hook property Setter: "+propName); }
	}
	

}

/* function getOriginalUrl(url){
	if (arguments[0] && arguments[0].indexOf("data:text/html,<!--originalUrl") == 0){
		return "http://www.siteerror.com/"
	} else {
		return url;
	}
} */

try {
  start();
} catch (e) {
  // alert(e); 
}


