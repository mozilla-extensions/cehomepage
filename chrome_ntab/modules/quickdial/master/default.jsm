var EXPORTED_SYMBOLS = ['defaultQuickDial'];

defaultQuickDial = {
	dialData: {
		'1': {
			title: decodeURIComponent('%E7%81%AB%E7%8B%90%E7%BD%91%E5%9D%80%E5%A4%A7%E5%85%A8'),
			url: 'http://www.huohu123.com/?src=qd',
			icon: 'chrome://ntab/skin/logo/mozilla.ico'
		},
		
		'2': {
			title: decodeURIComponent('%E7%99%BE%E5%BA%A6'),
			url: 'http://www.baidu.com/index.php?tn=monline_5_dg',
			icon: 'chrome://ntab/skin/logo/baidu.ico'
		},
		
		'3': {
			title: decodeURIComponent('%E6%96%B0%E6%B5%AA'),
			url: 'http://www.sina.com.cn/',
			icon: 'chrome://ntab/skin/logo/sina.ico'
		},
		
		'4': {
			title: decodeURIComponent('%E4%BA%BA%E4%BA%BA%E7%BD%91'),
			url: 'http://www.renren.com/',
			icon: 'chrome://ntab/skin/logo/renren.ico'
		},
		
		'5': {
			title: decodeURIComponent('%E6%B7%98%E5%AE%9D%E5%95%86%E5%9F%8E'),
			url: 'http://www.tmall.com/go/chn/tbk_channel/tmall_new.php?pid=mm_12811289_2210561_8696507&eventid=101334',
			icon: 'chrome://ntab/skin/logo/tmall.png'
		},
		
		'6': {
			title: decodeURIComponent('%E5%8D%93%E8%B6%8A%E7%BD%91'),
			url: 'http://www.amazon.cn/?source=mozilla9-23',
			icon: 'chrome://ntab/skin/logo/joyo.ico'
		},
		
		'7': {
			title: decodeURIComponent('%E4%BA%AC%E4%B8%9C%E5%95%86%E5%9F%8E'),
			url: 'http://click.union.360buy.com/JdClick/?unionId=206&siteId=8&to=http://www.360buy.com/',
			icon: 'chrome://ntab/skin/logo/360.ico'
		}
	},
	
	snapshotMap: {
		'http://www.huohu123.com/': 'chrome://ntab/skin/thumb/master/huohu123.png',
		'http://www.huohu123.com/?src=qd': 'chrome://ntab/skin/thumb/master/huohu123.png',
		'http://www.huohu123.com/?src=ntab': 'chrome://ntab/skin/thumb/master/huohu123.png',
		'http://www.baidu.com/': 'chrome://ntab/skin/thumb/master/baidu.png',
		'http://www.baidu.com/index.php?tn=monline_5_dg': 'chrome://ntab/skin/thumb/master/baidu.png',
		'http://www.renren.com/': 'chrome://ntab/skin/thumb/master/renren.png',
		'http://www.360buy.com/': 'chrome://ntab/skin/thumb/master/360.png',
		'http://click.union.360buy.com/JdClick/?unionId=206&siteId=8&to=http://www.360buy.com/': 'chrome://ntab/skin/thumb/master/360.png',
		'http://www.tmall.com/': 'chrome://ntab/skin/thumb/master/taobao.png',
		'http://s.click.taobao.com/t_9?p=mm_12811289_0_0&l=http%3A%2F%2Fmall.taobao.com%2F': 'chrome://ntab/skin/thumb/master/tmall.png',
		'http://www.tmall.com/go/chn/tbk_channel/tmall_new.php?pid=mm_12811289_2210561_8696507&eventid=101334': 'chrome://ntab/skin/thumb/master/tmall.png',
		'http://www.sina.com.cn/': 'chrome://ntab/skin/thumb/master/sina.png',
		'http://www.amazon.cn/': 'chrome://ntab/skin/thumb/master/joyo.png',
		'http://www.amazon.cn/?source=mozilla9-23': 'chrome://ntab/skin/thumb/master/joyo.png',
	},
	
	sitesTabs: [{
		nameStr: 'ntab.dial.label.navsites',
		urlPref: 'moa.ntab.dial.sitesurl',
		tabId:   'nav_sites',
		showIcon: false,
		panelId: 'nav_sites_panel'					// can be none
	}]
};