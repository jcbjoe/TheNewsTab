document.querySelector(".toggle-button").addEventListener("click", function () {
  document.getElementById("settings-modal").style.display = "block";
  OpenSettings();
});

chrome.topSites.get((sites) => {
  let innerSites = "";
  sites = sites.slice(0, 8);
  sites.forEach((site) => {
    if (site.title.length > 16) {
      innerSites += `<div class="column"><a href="${
        site.url
      }"><div class="box" style="height: 100px;"><div style="transform: translateY(50%);"><img src="https://s2.googleusercontent.com/s2/favicons?domain=${
        site.url
      }"><br>${site.title.slice(0, 14)}...</div></div></a></div> `;
    } else {
      innerSites += `<div class="column"><a href="${
        site.url
      }"><div class="box" style="height: 100px;"><div style="transform: translateY(50%);"><img src="https://s2.googleusercontent.com/s2/favicons?domain=${
        site.url
      }"><br>${site.title.slice(0, 14)}</div></div></a></div> `;
    }
  });

  document.getElementById("commonSites").innerHTML = innerSites;
});

Load();

CleanUpUrls();

async function Load() {
  let news = await BuildNews();

  news.sort((a, b) => b.pubDate - a.pubDate);

  news = news.slice(0, 20);

  const html = await ConvertNewsToCards(news);

  document.getElementById("news").innerHTML = html;
}

async function GetFeeds() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["feeds"], async function (result) {
      if (!result["feeds"]) {
        const feeds = [];

        const verge = await GenerateFeedInfo("http://theverge.com/rss/index.xml");
        const bbc = await GenerateFeedInfo("http://feeds.bbci.co.uk/news/rss.xml?edition=uk");
        const macrumours = await GenerateFeedInfo("http://feeds.macrumors.com/MacRumors-All");
        const fselite = await GenerateFeedInfo("https://fselite.net/feed");
        feeds.push(verge);
        feeds.push(bbc);
        feeds.push(macrumours);
        feeds.push(fselite);

        chrome.storage.sync.set({ feeds: feeds }, function () {
          resolve(feeds);
        });
      } else {
        resolve(result["feeds"]);
      }
    });
  });
}

async function GenerateFeedInfo(url) {
  const rssData = await GetRSS(url);
  const feedObj = {
    link: rssData.link,
    title: rssData.title,
    favicon: `https://s2.googleusercontent.com/s2/favicons?domain=${rssData.link}`,
    rssLink: url,
    enabled: true,
  };
  return feedObj;
}

async function BuildNews() {
  const feeds = await GetFeeds();

  const news = [];

  for (const feed of feeds) {
    console.log(feed);
    if (feed.enabled) {
      const rss = await GetRSS(feed.rssLink);
      for (const item of rss.items) {
        item.publisher = rss.title;
        item.pubDate = new Date(item.pubDate);
        news.push(item);
      }
    }
  }

  return news;
}

async function ConvertNewsToCards(news) {
  let html = "";
  for (const article of news) {
    let img = GetImageFromContent(article.content);
    if (img == null) {
      img = await GetImageFromURL(article.link);
    }
    article.img = img;
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
  return html;
}

async function GetRSS(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ contentScriptQuery: "rss", url: url }, async (data) => {
      resolve(data);
    });
  });
}

async function GetImageFromURL(url) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["imageCache"], async function (result) {
      if (!result["imageCache"]) {
        const data = await GetWebpageSource(url);

        const parsedData = new window.DOMParser().parseFromString(data, "text/html");
        var meta = parsedData.querySelector('meta[property="og:image"]');
        var value = meta && meta.getAttribute("content");

        const map = new Map();

        map.set(url, { imgUrl: value, lastAccessed: new Date().toISOString() });

        chrome.storage.local.set({ imageCache: Array.from(map) }, function () {
          resolve(value);
        });
      } else {
        const map = new Map(result["imageCache"]);

        if (map.has(url)) {
          map.set(url, { imgUrl: map.get(url).imgUrl, lastAccessed: new Date().toISOString() });

          chrome.storage.local.set({ imageCache: Array.from(map) }, function () {
            resolve(map.get(url).imgUrl);
          });
        } else {
          const data = await GetWebpageSource(url);

          const parsedData = new window.DOMParser().parseFromString(data, "text/html");
          var meta = parsedData.querySelector('meta[property="og:image"]');
          var value = meta && meta.getAttribute("content");

          map.set(url, { imgUrl: value, lastAccessed: new Date().toISOString() });

          chrome.storage.local.set({ imageCache: Array.from(map) }, function () {
            resolve(value);
          });
        }
      }
    });
  });
}

async function clearLocalStorage() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.clear(function () {
      var error = chrome.runtime.lastError;
      if (error) reject(error);
      else resolve();
    });
  });
}

async function clearSyncStorage() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.clear(function () {
      var error = chrome.runtime.lastError;
      if (error) reject(error);
      else resolve();
    });
  });
}

async function GetWebpageSource(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ contentScriptQuery: "get", url: url }, async (data) => {
      resolve(data);
    });
  });
}

function GetImageFromContent(content) {
  const text = $("<textarea />").html(content).text();
  var parser = new DOMParser();
  var htmlDoc = parser.parseFromString(text, "text/html");
  const img = htmlDoc.querySelector("img");
  if (img) return img.src;
  else null;
}

async function CleanUpUrls() {
  chrome.runtime.sendMessage({ contentScriptQuery: "cacheClean" });
}

async function OpenSettings() {
  const settings = [{ key: "maxPosts", value: "", friendlyName: "Maximum Posts" }];

  let generalHtml = "<table style='width:100%'><thead><tr><td>RSS Name</td><td>Enabled</td></tr></thead>";

  for (const setting of settings) {
    generalHtml += `<tr><td>${setting.friendlyName}</td><td><input type="text" value="${setting.value}"></td></tr>`;
  }

  generalHtml += "</table>";

  document.getElementById("settings-general").innerHTML = generalHtml;

  const feeds = await GetFeeds();

  let feedHtml = "<table style='width:100%'><thead><tr><td>RSS Name</td><td>Enabled</td></tr></thead>";

  for (const feed of feeds) {
    feedHtml += `<tr><td>${feed.title}</td><td><input type="checkbox"></td></tr>`;
  }

  feedHtml += '<tr><td></td><td><button class="button is-success"><i class="fas fa-plus"></i></button></td></tr></table>';

  document.getElementById("settings-feeds").innerHTML = feedHtml;
}
