var EXPORTED_SYMBOLS = ['defaultQuickDial'];

defaultQuickDial = {
	dialData: {
		'1': {
			title: '\u706B\u72D0\u7F51\u5740\u5927\u5168',
			url: 'http://www.huohu123.com/?src=qd',
			icon: 'chrome://ntab/skin/logo/mozilla.ico'
		},

		'2': {
			title: '\u767E\u5EA6',
			url: 'http://www.baidu.com/index.php?tn=monline_5_dg',
			icon: 'chrome://ntab/skin/logo/baidu.ico'
		},

		'3': {
			title: '\u65B0\u6D6A',
			url: 'http://www.sina.com.cn/',
			icon: 'chrome://ntab/skin/logo/sina.ico'
		},

		'4': {
			title: '\u4EBA\u4EBA\u7F51',
			url: 'http://www.renren.com/',
			icon: 'chrome://ntab/skin/logo/renren.ico'
		},

		'5': {
			title: '\u6DD8\u5B9D\u7279\u5356',
			url: 'http://click.mz.simba.taobao.com/rd?w=mmp4ptest&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_9313997&k=e02915d8b8ad9603',
			icon: 'chrome://ntab/skin/logo/taobao.ico'
		},

		'6': {
			title: '\u4E9A\u9A6C\u900A',
			url: 'http://www.amazon.cn/?source=mozilla9-23',
			icon: 'chrome://ntab/skin/logo/joyo.ico'
		},

		'7': {
			title: '\u767E\u5EA6\u6E38\u620F',
			url: 'http://youxi.baidu.com/yxpm/pm.jsp?pid=11016500091_877110',
			icon: '',
			rev: '5'
		}
	},

	snapshotMap: {
		'http://www.huohu123.com/': 'chrome://ntab/skin/thumb/master/huohu123.png',
		'http://www.huohu123.com/?src=qd': 'chrome://ntab/skin/thumb/master/huohu123.png',
		'http://www.huohu123.com/?src=ntab': 'chrome://ntab/skin/thumb/master/huohu123.png',
		'http://www.baidu.com/': 'chrome://ntab/skin/thumb/master/baidu.png',
		'http://www.baidu.com/index.php?tn=monline_5_dg': 'chrome://ntab/skin/thumb/master/baidu.png',
		'http://www.renren.com/': 'chrome://ntab/skin/thumb/master/renren.png',
		'http://youxi.baidu.com/yxpm/pm.jsp?pid=11016500091_877110': 'chrome://ntab/skin/thumb/master/baidu-youxi.png',
		'http://www.tmall.com/': 'chrome://ntab/skin/thumb/master/taobao.png',
		'http://s.click.taobao.com/t_9?p=mm_12811289_0_0&l=http%3A%2F%2Fmall.taobao.com%2F': 'chrome://ntab/skin/thumb/master/tmall.png',
		'http://www.tmall.com/go/chn/tbk_channel/tmall_new.php?pid=mm_28347190_2425761_9313997&eventid=101334': 'chrome://ntab/skin/thumb/master/tmall.png',
		'http://click.mz.simba.taobao.com/rd?w=mmp4ptest&f=http%3A%2F%2Fwww.taobao.com%2Fgo%2Fchn%2Ftbk_channel%2Fonsale.php%3Fpid%3Dmm_28347190_2425761_9313997&k=e02915d8b8ad9603' : 'chrome://ntab/skin/thumb/master/taobaohot.jpg',
		'http://www.sina.com.cn/': 'chrome://ntab/skin/thumb/master/sina.png',
		'http://www.amazon.cn/': 'chrome://ntab/skin/thumb/master/joyo.png',
		'http://www.amazon.cn/?source=mozilla9-23': 'chrome://ntab/skin/thumb/master/joyo.png',
        'http://www.google.com/': 'chrome://ntab/skin/thumb/master/google.jpg',
        'http://www.google.com.hk/': 'chrome://ntab/skin/thumb/master/google.jpg',
        'http://www.youdao.com/': 'chrome://ntab/skin/thumb/master/youdao.jpg',
        'http://cn.bing.com/': 'chrome://ntab/skin/thumb/master/bing.jpg',
        'http://www.bing.com/': 'chrome://ntab/skin/thumb/master/bing.jpg',
	},

	sitesTabs: [{
		nameStr: 'ntab.dial.label.navsites',
		urlPref: 'moa.ntab.dial.sitesurl',
		tabId:   'nav_sites',
		showIcon: false,
		panelId: 'nav_sites_panel'					// can be none
	}]
};
