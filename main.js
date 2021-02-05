var slideout = new Slideout({
    'panel': document.getElementById('panel'),
    'menu': document.getElementById('menu'),
    'padding': 256,
    'tolerance': 70
});

// Toggle button
document.querySelector('.toggle-button').addEventListener('click', function () {
    slideout.toggle();
});


chrome.topSites.get((sites) => {
    let innerSites = "";
    sites = sites.slice(0, 8)
    sites.forEach((site) => {
        if (site.title.length > 16) {
            innerSites += `<div class="column"><a href="${site.url}"><div class="box" style="height: 100px;"><div style="transform: translateY(50%);"><img src="https://s2.googleusercontent.com/s2/favicons?domain=${site.url}"><br>${site.title.slice(0, 14)}...</div></div></a></div> `;
        } else {
            innerSites += `<div class="column"><a href="${site.url}"><div class="box" style="height: 100px;"><div style="transform: translateY(50%);"><img src="https://s2.googleusercontent.com/s2/favicons?domain=${site.url}"><br>${site.title.slice(0, 14)}</div></div></a></div> `;
        }

    })

    document.getElementById("commonSites").innerHTML = innerSites;

});

LoadNews();

CleanUpUrls()

async function LoadNews() {

    let news = await BuildNews();

    news.sort((a, b) => b.pubDate - a.pubDate)

    news = news.slice(0, 20)

    const html = await ConvertNewsToCards(news);

    document.getElementById("news").innerHTML = html;
}

async function BuildNews() {

    const urls = ["http://theverge.com/rss/index.xml", "http://feeds.bbci.co.uk/news/rss.xml?edition=uk", "http://feeds.macrumors.com/MacRumors-All", "http://feeds.washingtonpost.com/rss/rss_powerpost?itid=lk_inline_manual_4"];

    let news = [];

    for (const url of urls) {
        const rss = await GetRSS(url);
        for (const item of rss.items) {
            item.publisher = rss.title;
            item.pubDate = new Date(item.pubDate)
            news.push(item);
        }
    }

    return news;

}

async function ConvertNewsToCards(news) {
    let html = ""
    for (const article of news) {
        let img = GetImageFromContent(article.content);
        if (img == null) {
            img = await GetImageFromURL(article.link);
        }
        article.img = img
        html += `<div class="column is-one-fifth"><a href="${article.link}">
                    <div class="card">
                        <div class="card-image">
                            <figure class="image is-4by3">
                            <img src="${img}" style="object-fit: cover;" alt="Placeholder image">
                            </figure>
                        </div>
                        <div class="card-content">
                            <div class="content">${article.title}</div>
                            <p class="subtitle">
                            <img src="https://s2.googleusercontent.com/s2/favicons?domain=${article.link}"> <span style="font-size: 15px;">${article.publisher}</span>
                            </p>
                        </div>
                    </div></a>
                </div>`;
    }
    return html
}

async function GetRSS(url) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ contentScriptQuery: 'rss', url: url }, async data => {
            resolve(data);
        });
    })
}

async function GetImageFromURL(url) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([url], function (result) {
            if (!result[url]) {
                chrome.runtime.sendMessage({ contentScriptQuery: 'get', url: url }, async data => {

                    const parsedData = new window.DOMParser().parseFromString(data, "text/html")
                    var meta = parsedData.querySelector('meta[property="og:image"]');
                    var value = meta && meta.getAttribute('content');

                    const storageVal = {};
                    storageVal[url] = { imgUrl: value, lastAccessed: new Date().toISOString() };

                    chrome.storage.local.set(storageVal, function () {
                        resolve(value);
                    });
                });
            } else {
                const storageVal = {};
                storageVal[url] = { imgUrl: result[url].imgUrl, lastAccessed: new Date().toISOString() };
                chrome.storage.local.set(storageVal, function () {
                    resolve(result[url].imgUrl);
                });
            }
        });

    })
}

function GetImageFromContent(content) {
    const text = $('<textarea />').html(content).text();
    var parser = new DOMParser();
    var htmlDoc = parser.parseFromString(text, 'text/html');
    const img = htmlDoc.querySelector("img")
    if (img) return img.src;
    else null;
}

async function CleanUpUrls() {
    chrome.runtime.sendMessage({ contentScriptQuery: 'cacheClean' });
}