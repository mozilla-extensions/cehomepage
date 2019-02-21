(function() {
  // this needs to be kept up to date with distribution.ini
  const distBookmarks = {
    "https://c.duomai.com/track.php?k=9QnJ9QWa1VmJxYTPklWYmcDNz0DZp9VZ0l2cmYiJt92YuQmauc3d3ZkMlYkMlE0MlMHc0RHa": "toolbar:jd",
    "https://www.baidu.com/index.php?tn=monline_3_dg": "baidu:home",
    "http://weibo.com/?c=spr_web_sq_firefox_weibo_t001": "weibo:home",
    "https://vip.iqiyi.com/waimeizhy_pc.html?fv=zz_5993b5deb9f24": "iqiyi:vip",
    "http://ai.taobao.com/?pid=mm_28347190_2425761_17624777": "taobao:legacy",
    "https://c.duomai.com/track.php?k=nJ9QWa1VmJxYTPklWYmcDOykzMx0DZp9VZ0l2cmYiJt92YuQmauc3d3ZkMlYkMlE0MlMHc0RHa9Q": "jd:union",
    "https://apple.pvxt.net/c/1252180/435400/7639?u=https%3A%2F%2Fwww.apple.com%2Fcn%2F": "applestore:home",
    "https://www.amazon.cn/?source=Mozilla": "amazondotcn:home",
    "http://www.hao123.com/?tn=12092018_12_hao_pg": "hao123:home"
  };

  class PartnerBookmarks {
    constructor() {
      this.signatureKey = "partnerbookmarks:signature";
    }

    async currentSignature() {
      let result = await browser.storage.local.get(this.signatureKey);
      return result[this.signatureKey] || "";
    }

    async init() {
      let signature = await this.currentSignature();

      signature = await this.updateFromDist(signature);
      signature = await this.updateFromLegacy(signature);
      signature = await this.updateFromServer(signature);

      await browser.storage.local.set({[this.signatureKey]: signature});
    }

    keywordForBookmark(bookmark) {
      if (!bookmark.id.startsWith("DstB-")) {
        return "";
      }

      let keyword = distBookmarks[bookmark.url];
      if (!keyword) {
        console.log(`No keyword for ${bookmark.url} from distribution.ini`);
        return "";
      }

      return `partnerbookmarks:${keyword}`;
    }

    async updateFromDist(signature) {
      if (signature) {
        return signature;
      }

      let updates = this.updatesFromTree(await browser.bookmarks.getTree());
      if (!Object.keys(updates).length) {
        return "";
      }

      await browser.storage.local.set(updates);
      return "from_dist";
    }

    async updateFromLegacy(signature) {
      if (signature) {
        return signature;
      }

      let updates = await browser.mozillaonline.chinaEditionHomepage.getLegacyPartnerBookmarks();
      if (!Object.keys(updates).length) {
        return "";
      }

      await browser.storage.local.set(updates);
      return "from_legacy";
    }

    async updateFromServer(oldSignature) {
      try {
        let url = "https://bookmarks-ssl.firefoxchina.cn/bookmarks/updates.json";
        let response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Got "${response.status} ${response.statusText}" for "${url}"`);
        }

        let json = await response.json();
        if (!json.data || !json.signature || json.signature === oldSignature) {
          return oldSignature;
        }

        let data = JSON.parse(json.data);
        let keywords = Object.keys(data);
        let normalize = keyword => keyword.replace(/^mozcn/, "partnerbookmarks");
        await Promise.all(keywords.map(async keyword => {
          let normalizedKeyword = normalize(keyword);
          let {[normalizedKeyword]: id} = await browser.storage.local.get(normalizedKeyword);
          if (!id) {
            console.log(`No bookmark exists for keyword: ${keyword}`);
            return "";
          }

          let item = data[keyword];
          if (!item.uri) {
            return Promise.all([
              browser.bookmarks.remove(id),
              browser.storage.local.remove(normalizedKeyword)
            ]);
          }

          let changes = {url: item.uri};
          if (item.title) {
            changes.title = item.title;
          }
          if (item.favicon) {
            console.log(`Impossible to update favicon for ${id}:${item.uri}`);
          }

          if (!item.keyword || item.keyword === keyword) {
            return browser.bookmarks.update(id, changes);
          }
          return Promise.all([
            browser.bookmarks.update(id, changes),
            browser.storage.local.set({[normalize(item.keyword)]: id}),
            browser.storage.local.remove(normalizedKeyword)
          ]);
        }));

        return json.signature;
      } catch (ex) {
        console.error(ex);
        return oldSignature;
      }
    }

    updatesFromTree(tree) {
      let updates = {};

      for (let node of tree) {
        switch (node.type) {
          case "bookmark":
            let keyword = this.keywordForBookmark(node);
            if (keyword) {
              updates[keyword] = node.id;
            }
            break;
          case "folder":
            let subUpdates = this.updatesFromTree(node.children);
            Object.assign(updates, subUpdates);
            break;
          default:
            break;
        }
      }

      return updates;
    }
  }

  let partnerBookmarks = new PartnerBookmarks();
  partnerBookmarks.init();
})();
