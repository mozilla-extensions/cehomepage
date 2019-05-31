(function() {
  // this needs to be kept up to date with distribution.ini
  const distBookmarks = {
    "https://c.duomai.com/track.php?k=9QnJ9QWa1VmJxYTPklWYmcDNz0DZp9VZ0l2cmYiJt92YuQmauc3d3ZkMlYkMlE0MlMHc0RHa": "toolbar:jd",
    "https://www.baidu.com/index.php?tn=monline_3_dg": "baidu:home",
    "https://www.ifeng.com/?source=mozilla": "ifeng:home",
    "https://weibo.com/?source=mozilla": "weibo:home",
    "https://ai.taobao.com/?pid=mm_28347190_2425761_17624777": "taobao:legacy",
    "https://c.duomai.com/track.php?k=nJ9QWa1VmJxYTPklWYmcDOykzMx0DZp9VZ0l2cmYiJt92YuQmauc3d3ZkMlYkMlE0MlMHc0RHa9Q": "jd:union",
    "https://www.ctrip.com/?AllianceID=263200&sid=1851274&ouid=&app=0101F00": "ctrip:home",
    "http://www.hao123.com/?tn=12092018_12_hao_pg": "hao123:home"
  };

  class PartnerBookmarks {
    constructor() {
      this.additionKey = "partnerbookmarks:addition";
      this.signatureKey = "partnerbookmarks:signature";
    }

    async currentAddition() {
      let result = await browser.storage.local.get(this.additionKey);
      return result[this.additionKey] || "";
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

    async maybeCreateBookmark(item, keyword) {
      if (!keyword.startsWith("mozcn:toolbar:") || item.keyword !== keyword ||
          !item.uri || !item.title || !item.faviconUrl || !item.conflict || !item.addUntil) {
        console.log(`No bookmark exists for keyword: ${keyword}`);
        return "";
      }

      let addition = await this.currentAddition();
      if (addition >= item.addUntil) {
        return "";
      }

      if (Date.now() >= item.addition * 3600e3) {
        return browser.storage.local.set({[this.additionKey]: item.addUntil});
      }

      let parentId = "toolbar_____";
      let bookmarksOnToolbar = await browser.bookmarks.getChildren(parentId);
      let conflictRegExp = new RegExp(item.conflict);
      if (bookmarksOnToolbar.some(bookmark => {
        return bookmark.type === "bookmark" && conflictRegExp.test(bookmark.url);
      })) {
        console.log(`Blocked creating bookmark for keyword: ${keyword}`);
        return browser.storage.local.set({[this.additionKey]: item.addUntil});
      }

      console.log(`Create bookmark for keyword: ${keyword}`);
      let newBookmark = await browser.bookmarks.create({
        index: Math.min(4, bookmarksOnToolbar.length), parentId, title: item.title, url: item.uri
      });
      browser.mozillaonline.chinaEditionHomepage.setFaviconForUrl(item.uri, item.faviconUrl);
      return browser.storage.local.set({
        [this.additionKey]: item.addUntil,
        [this.normalize(item.keyword)]: newBookmark.id
      });
    }

    normalize(keyword) {
      return keyword.replace(/^mozcn/, "partnerbookmarks");
    }

    async updateFromDist(signature) {
      if (signature) {
        return signature;
      }

      await new Promise(resolve => setTimeout(resolve, 15e3));
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
        let url = "https://bookmarks-ssl.firefoxchina.cn/bookmarks/updates-v2.json";
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
        let logError = ex => console.error(ex);
        await Promise.all(keywords.map(async keyword => {
          let item = data[keyword];
          let normalizedKeyword = this.normalize(keyword);
          let {[normalizedKeyword]: id} = await browser.storage.local.get(normalizedKeyword);
          if (!id) {
            return this.maybeCreateBookmark(item, keyword);
          }

          // Bookmark with the recorded id may cease to exist
          if (!item.uri) {
            return Promise.all([
              browser.bookmarks.remove(id).catch(logError),
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
            return browser.bookmarks.update(id, changes).catch(logError);
          }
          return Promise.all([
            browser.bookmarks.update(id, changes).catch(logError),
            browser.storage.local.set({[this.normalize(item.keyword)]: id}),
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
