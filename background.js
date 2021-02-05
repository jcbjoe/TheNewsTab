chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.contentScriptQuery == 'get') {
            fetch(request.url)
                .then(response => response.text())
                .then(str => sendResponse(str))
            return true;  // Will respond asynchronously.
        }
        if (request.contentScriptQuery == 'rss') {
            let parser = new RSSParser();
            parser.parseURL(request.url, function (err, feed) {
                if (err) throw err;
                sendResponse(feed);
            })
            return true;  // Will respond asynchronously.
        }
        if (request.contentScriptQuery == 'cacheClean') {
            chrome.storage.local.get(null, function (items) {
                for (const [key, value] of Object.entries(items)) {
                    const dateNow = new Date();
                    dateNow.setHours(dateNow.getHours() + 2);
                    if (new Date(value.lastAccessed) > dateNow) {
                        chrome.storage.local.remove([key], function () {
                        })
                    }
                }
            });
        }
    });