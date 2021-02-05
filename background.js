chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.contentScriptQuery == "get") {
    fetch(request.url)
      .then((response) => response.text())
      .then((str) => sendResponse(str));
    return true; // Will respond asynchronously.
  }
  if (request.contentScriptQuery == "rss") {
    let parser = new RSSParser();
    parser.parseURL(request.url, function (err, feed) {
      if (err) throw err;
      sendResponse(feed);
    });
    return true; // Will respond asynchronously.
  }
  if (request.contentScriptQuery == "cacheClean") {
    chrome.storage.local.get(null, function (result) {
      chrome.storage.local.get(["imageCache"], async function (result) {
        if (result["imageCache"]) {
          const dateNow = new Date();
          const map = new Map(result["imageCache"]);
          map.forEach(function (value, key) {
            dateNow.setHours(dateNow.getHours() + 2);
            if (new Date(value.lastAccessed) > dateNow) {
              chrome.storage.local.remove([key], function () {});
            }
          });
        }
      });
    });
  }
});
