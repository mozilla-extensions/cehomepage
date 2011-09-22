function form_submit() {
	if(el("radio1").checked == true){
		if(!((el("google_page_sign").value == "out")&&(el("google_js_sign").value == "out"))) {
			var wd_value = document.getElementsByName("wd")[0].value;
			var insert_array = new Array("q","sa","prog","client","h1","source","sdo_rt");
			var insert_value = new Array(wd_value,"%E8%B0%B7%E6%AD%8C%E6%90%9C%E7%B4%A2","aff","pub-5995010675973275", "zh-CN", "sdo_sb", "ChBLOGZAAAXh8Qp6XwoyeSeqEg5fX1JMX0RFRkFVTFRfXxoIKqnKJYJiz3YoAVj6t-zaoLvI5Wo");
			var remove_array = new Array("tn","ie","s");
			var i;
			for(i=0; i<remove_array.length; i++) {
				remove_child(remove_array[i]);
			}
			for(i=0; i<insert_array.length; i++) {
				insert_child(insert_array[i], insert_value[i]);
			}
		}
	}
	if(el("radio2").checked == true){
		if(el("baidu_taobao_sign").value == "out"){
			var wd_value = document.getElementsByName("wd")[0].value;
			var remove_array = new Array("sa","prog","client","h1","source","sdo_rt","tn","ie");
			var insert_array = new Array("q","s");
			var insert_value = new Array(wd_value,"baidu_web");
			for(i=0; i<remove_array.length; i++) {
				remove_child(remove_array[i]);
			}
			for(i=0; i<insert_array.length; i++) {
				insert_child(insert_array[i], insert_value[i]);
			}
		}
		if(el("baidu_taobao_sign").value == "in"){
			var remove_array = new Array("q","sa","prog","client","h1","source","sdo_rt");
			var insert_array = new Array("tn","ie","s");
			var insert_value = new Array("monline_5_dg","utf-8","baidu_web");
			for(i=0; i<remove_array.length; i++) {
				remove_child(remove_array[i]);
			}
			for(i=0; i<insert_array.length; i++) {
				insert_child(insert_array[i], insert_value[i]);
			}
		}
	}
	if(el("radio3").checked == true){
	/*	if(el("baidu_taobao_sign").value == "out"){
			var wd_value = document.getElementsByName("wd")[0].value;
			var remove_array = new Array("sa","prog","client","h1","source","sdo_rt","tn","ie");
			var insert_array = new Array("q","s");
			var insert_value = new Array(wd_value,"taobao");
			for(i=0; i<remove_array.length; i++) {
				remove_child(remove_array[i]);
			}
			for(i=0; i<insert_array.length; i++) {
				insert_child(insert_array[i], insert_value[i]);
			}
		}*/
		
	}
	document.getElementsByName("search_form")[0].submit();
}

function check(val) {
//	document.getElementsByName("s")[0].value = val.value;
	if(val.value == "google_web") {
		el("search_img").src="chrome://ceerrorpage/content/google_web.png";
		el("img_a").href="http://www.google.cn/";
		el("taobao_zhidao_frame").style.display="none";
		if((el("google_page_sign").value == "out")&&(el("google_js_sign").value == "out")) {
			document.getElementsByTagName('form').item(0).action="http://i.firefoxchina.cn/se";
			document.getElementsByName("wd")[0].style.display="none";
			el("search_button").style.display="none";
			el("google_frame").style.display="block";
		} else {
			document.getElementsByName("wd")[0].style.display="block";
			el("search_button").value="谷歌搜索"
			el("search_button").style.display="block";
			el("google_frame").style.display="none";
			document.getElementsByTagName('form').item(0).action="http://www.google.cn/search?"
		}
	} else if(val.value == "baidu_web") {
		var i;
		el("search_img").src="chrome://ceerrorpage/content/baidu_web.png";
		el("img_a").href="http://www.baidu.com/index.php?tn=monline_5_dg";
		el("google_frame").style.display="none";
		el("taobao_zhidao_frame").style.display="none";
		el("search_button").style.display="inline";
		el("search_button").value="百度搜索"
		document.getElementsByName("wd")[0].style.display="inline";
		// Focus input only when the error page is shown on top window
		// Or the main page will scroll to the iframe
		if (window == window.top) {
			document.getElementsByName("wd")[0].focus();
		}
		
		if(el("baidu_taobao_sign").value == "out") {
			document.getElementsByTagName('form').item(0).action="http://i.firefoxchina.cn/se";
		} else {
			document.getElementsByTagName('form').item(0).action="http://www.baidu.com/baidu?";
		}
	} else if(val.value == "taobao") {
		el("google_frame").style.display="none";
		el("search_button").style.display="none";
		document.getElementsByName("wd")[0].style.display="none";
		el("search_img").src="chrome://ceerrorpage/content/taobao.png";
		el("img_a").href="http://adtaobao.allyes.cn/main/adfclick?db=adtaobao&bid=5566,2826,805&cid=32572,581,1&sid=67276&show=ignore&url=http://search8.taobao.com/browse/search_auction.htm?pid=mm_12811289_0_0&commend=all&search_type=auction&user_actionpsearch=1&sort=&spercent=0";
		el("taobao_zhidao_frame").style.display="block";
		if(el("baidu_taobao_sign").value == "out") {	
		
		} else {
			el("taobao_zhidao_frame").contentDocument.getElementsByTagName('form').item(0).setAttribute("action","http://search.taobao.com/search?");			
		}
	}
}

function checkspan(val)
{
	if(val.id == "span1")
	{
		el("radio1").click();
	}
	if(val.id == "span2")
	{
		el("radio2").click();
	}
	if(val.id == "span3")
	{
		el("radio3").click();
	}
}
function remove_child(nodename) {
	if(document.getElementsByName(nodename).length > 0) {
		document.getElementsByName("search_form")[0].removeChild(document.getElementsByName(nodename)[0]);
	}
}
function insert_child(nodename, nodevalue) {
	if(document.getElementsByName(nodename).length == 0) {
		var temp = document.createElement("input");
		temp.setAttribute("name", nodename);
		temp.setAttribute("value", nodevalue);
		temp.setAttribute("type", "hidden");
		document.getElementsByName("search_form")[0].appendChild(temp);
	}
	else
	{
		document.getElementsByName(nodename)[0].value = nodevalue;
	}
}

  
function init() {
	el("radio2").click();
}

var __ie__ = el('__ie__');
if (!__ie__) {
    window['__event__'] = function(evt) { return evt; };
}

function observe_event(element, eventName, handler) {
    if (element.addEventListener) {
      element.addEventListener(eventName, handler, false);
    } else {
      element.attachEvent("on" + eventName, handler);
    }
}     

function stop_event(evt) {
    evt = window.event ? window.event : evt;
       if (evt) {
           if(__ie__) {
            evt.cancelBubble = true;
            evt.returnValue = false;
           } else {
            evt.stopPropagation();
            evt.preventDefault();
            evt.target.blur();
           }
    }
}

var UTIL = {
    map: function(f, xs) {
        var ret = [];
        var len = xs.length;
        for (var i = 0; i < len; i++) {
            ret.push(f(xs[i]));
        }
        return ret;
    },
    
    get_height: function() {
        return document.body.scrollHeight;
    },
      
    getRel: function(elem) {
    	if (!!elem.getAttribute('rel'))
    	    return elem.getAttribute('rel');
    	var rel = /rel-([^ ]+)/i.exec(elem.className);
    	if (!!rel && rel.length == 2)
    	    return rel[1];
    }
};

var CSS = {
    is: function(node, cls) {
        var re = new RegExp('(^|\\s)' + cls + '(\\s|$)');
        if (re.test(node.className)) {
            return true;
        } else {
            return false;
        }
    },
    add: function(node, cls) {
        if (this.is(node, cls))
            return;
        var clss = node.className.split(' ');
        clss.push(cls);
        node.className = clss.join(' ');
    },
    del: function(node, cls) {
        var clss = node.className.split(' ');
        for (var i in clss) {
            if (clss[i] == cls) {
                clss.splice(i, 1);
                node.className = clss.join(' ');
                return;
            }
        }
    },
    find: function(cls, node) {
        if (!node) {
            node = document;
        }
        if (node.getElementsByClassName) {
            return node.getElementsByClassName(cls);
        } else if (node.querySelectorAll) {
            return node.querySelectorAll('.' + cls);
        } else if (document.getElementsByClassName) {
            return document.getElementsByClassName.call(node, cls);
        }
    }
};

var XHR = {
    get: function(url, cb) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4) {
                cb(xhr.responseText);
            }
        };
        xhr.open('GET', url, true);
        xhr.send('');
    }
};

var LINKTRACE = {
    hooks: {},
    trace: function(evt, link) {
        var href = link.getAttribute('href');
        if (/^#$/.test(href) || /^javascript:/.test(href)) {
            return;
        }
        
        if (this.nolinktrace(link))
        	return;
        	
        var tracer = link['__linktrace_tracer__'];
        if (tracer == null) {
            tracer = this.setup(link);
        }
        tracer(evt, link);
    },
    identify: function(link) {
        while (link) {
            if (CSS.is(link, 'link-trace')) {
                return UTIL.getRel(link);		 //link.getAttribute('rel');
            }
            link = link.parentNode;
        }
        return null;
    },
    nolinktrace : function(link) {
    	while (link) {
            if (CSS.is(link, 'no-link-trace')) {
                return true;
            }
            link = link.parentNode;
        }
        return false;
    },
    setup: function(link) {
        var tracer = null;
        var rel = this.identify(link);
        if (rel == null) {
            tracer = function() {};
        }
        var hook = this.hooks;
        if (this.hooks[rel]) {
            tracer = this.hooks[rel];
        } else {
            tracer = this.build(rel);
        }
        link['__linktrace_tracer__'] = tracer;
        return tracer;
    },
    build: function(rel) {
        var me = this;
        return function(evt, link) {
            link['__linktrace_tracer__'] = function() {};
            link.setAttribute('href', me.translate('http://i.firefoxchina.cn/hp', rel, link));
        };
    },
    translate: function(action, rel, link) {
        var tit = link.getAttribute('title');
        if (tit == null || tit.length == 0) {
            if (link.childNodes.length == 1 && link.firstChild.nodeType == 3) {
                tit = link.firstChild.nodeValue;
            } else if (link.nodeText) {
                tit = link.nodeText;
            } else {
                tit = '';
            }
        }
        return [action, '?u=', encodeURIComponent(link.href), '&c=', rel, '&t=', encodeURIComponent(tit)].join('');
    }
};


function do_click(node) {
    var evt = document.createEvent('MouseEvents');
    evt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    node.dispatchEvent(evt);
}

function links_onclick(evt) {
    trace_link(evt);
}

function trace_link(evt) {
    var target = evt.target || evt.srcElement;
    if (evt.button == 0) {
        if (target.nodeName.toLowerCase() == 'a') {
            LINKTRACE.trace(evt, target);
        } else if (target.parentNode && target.parentNode.nodeName.toLowerCase() == 'a') {
            LINKTRACE.trace(evt, target.parentNode);
        }
    }    
}

function el(id) { return document.getElementById(id); }
function log(msg) {
    return;
    var ll = el('log');
    var p = document.createElement('p');
    p.appendChild(document.createTextNode(msg));
    var x = ll.firstChild;
    while (x) {
        ll.removeChild(x);
        x = ll.firstChild;
    }
    ll.appendChild(p);
}

