SetupModal();

LoadTopSites();

LoadFeeds();

CleanUpUrls();

async function LoadTopSites() {
  chrome.topSites.get((sites) => {
    let innerSites = "";
    sites = sites.slice(0, 8);
    sites.forEach((site) => {
      let title = site.title;
      if (site.title.length > 14) {
        title = title.slice(0, 14) + "...";
      }
      innerSites += `
      <div class="column">
        <a href="${site.url}">
        <div class="box" style="height: 100px;">
          <div style="transform: translateY(50%);">
            <img alt="${title}" src="https://s2.googleusercontent.com/s2/favicons?domain=${site.url}">
            <br>
            <p>${title}</p>
          </div>
        </div>
        </a>
    </div>`;
    });

    document.getElementById("commonSites").innerHTML = innerSites;
  });
}

async function SetupModal() {
  var modal = document.querySelector(".modal"); // assuming you have only 1
  var html = document.querySelector("html");

  document.querySelector("#open-settings").addEventListener("click", function (event) {
    event.preventDefault();
    modal.classList.add("is-active");
    html.classList.add("is-clipped");

    OpenGeneralSettings();
    OpenRssSettings();
  });

  document.getElementById("save-settings").addEventListener("click", function (e) {
    SaveSettings();
  });

  modal.querySelector(".modal-background").addEventListener("click", function (e) {
    e.preventDefault();
    modal.classList.remove("is-active");
    html.classList.remove("is-clipped");
  });

  const closeElements = modal.getElementsByClassName("close-modal");

  for (const el of closeElements) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      modal.classList.remove("is-active");
      html.classList.remove("is-clipped");
    });
  }

  document.getElementById("clear-cache").addEventListener("click", function (e) {
    clearLocalStorage();
  });

  document.getElementById("reset-rss-feeds").addEventListener("click", function (e) {
    ResetRssFeeds();
  });

  document.getElementById("reset-settings").addEventListener("click", function (e) {
    ResetSettings();
  });
}

function closeSettings() {
  var modal = document.querySelector(".modal"); // assuming you have only 1
  var html = document.querySelector("html");

  modal.classList.remove("is-active");
  html.classList.remove("is-clipped");
}

async function LoadFeeds() {
  document.getElementById("news").innerHTML = "";

  let news = await BuildNews();

  news.sort((a, b) => b.pubDate - a.pubDate);

  const settings = await GetSettings();

  news = news.slice(0, settings["maxPosts"].value);

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
                            <div class="news-content">${article.title}</div>
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

async function ResetSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.remove("settings", async function () {
      var error = chrome.runtime.lastError;
      if (error) reject(error);
      else {
        // This adds the defaults back
        await GetSettings();
        await OpenGeneralSettings();
        resolve();
      }
    });
  });
}

async function ResetRssFeeds() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.remove("feeds", async function () {
      var error = chrome.runtime.lastError;
      if (error) reject(error);
      else {
        // This adds the defaults back
        await GetFeeds();
        await OpenRssSettings();
        resolve();
      }
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

async function OpenGeneralSettings() {
  document.getElementById("settings-general").innerHTML = "";

  const settings = await GetSettings();

  let generalHtml = "<table style='width:100%'><thead><tr><td>Setting</td><td>Value</td></tr></thead><tbody id='settings-general-table'>";

  for (const [key, setting] of Object.entries(settings)) {
    generalHtml += `<tr><td>${setting.friendlyName}</td><td><input data-key="${setting.key}" class="input is-small" type="text" value="${setting.value}"></td></tr>`;
  }

  generalHtml += "</tbody></table>";

  document.getElementById("settings-general").innerHTML = generalHtml;
}

async function OpenRssSettings() {
  document.getElementById("settings-feeds").innerHTML = "";

  const feeds = await GetFeeds();

  let feedHtml =
    "<table style='width:100%'><thead><tr><td>RSS Name</td><td class='centre-column'>Enabled</td><td class='centre-column'>Delete</td></tr></thead>";

  for (const feed of feeds) {
    const checked = feed.enabled ? "checked" : "";
    feedHtml += `<tr><td>${feed.title}</td><td class='centre-column'><input type="checkbox" ${checked}></td><td class='centre-column'><button data-url="${feed.rssLink}" class="button is-small RssDeleteBtn"><i class="fas fa-times"></i></button></td></tr>`;
  }

  feedHtml +=
    '<tr><td><input class="input is-expanded is-small" type="text" id="newRssValue" placeholder="Type an RSS URL"></td><td class="centre-column"><button id="newRssButton" class="button is-success is-small"><i class="fas fa-plus"></i></button></td></tr></table>';

  document.getElementById("settings-feeds").innerHTML = feedHtml;

  document.getElementById("newRssButton").addEventListener("click", function () {
    const url = document.getElementById("newRssValue").value;
    if (url == "") {
      console.log("No URL");
      return;
    }

    AddNewRSS(url);
  });

  const deleteButtons = document.getElementsByClassName("RssDeleteBtn");
  for (const deleteButton of deleteButtons) {
    const url = deleteButton.dataset.url;
    deleteButton.addEventListener("click", function () {
      RemoveRss(url);
    });
  }
}

async function AddNewRSS(url) {
  const rssFeed = await GenerateFeedInfo(url);

  const feeds = await GetFeeds();

  feeds.push(rssFeed);

  chrome.storage.sync.set({ feeds: feeds }, function () {
    OpenRssSettings();
    LoadFeeds();
  });
}

async function RemoveRss(url) {
  const feeds = await GetFeeds();
  let index = 0;
  let found = false;
  for (const feed of feeds) {
    if (feed.rssLink == url) {
      found = true;
      break;
    }
    index++;
  }

  if (found) {
    feeds.splice(index, 1);
  }

  chrome.storage.sync.set({ feeds: feeds }, function () {
    OpenRssSettings();
    LoadFeeds();
  });
}

async function GetSettings() {
  const settings = await new Promise((resolve, reject) => {
    chrome.storage.sync.get(["settings"], async function (result) {
      if (!result["settings"]) {
        const settings = [{ key: "maxPosts", value: "10", friendlyName: "Maximum Posts" }];

        chrome.storage.sync.set({ settings: settings }, function () {
          resolve(settings);
        });
      } else {
        resolve(result["settings"]);
      }
    });
  });

  const settingsFormatted = [];

  for (const setting of settings) {
    settingsFormatted[setting.key] = setting;
  }

  return settingsFormatted;
}

async function SaveSettings() {
  const settingContainerChildren = document.getElementById("settings-general-table").childNodes;

  const settings = await GetSettings();

  for (const node of settingContainerChildren) {
    const input = node.querySelector("input");
    const key = input.dataset.key;
    const settingVal = settings[key];
    settingVal.value = input.value;
    settings[key] = settingVal;
  }

  const newSettings = [];

  for (const [key, setting] of Object.entries(settings)) {
    newSettings.push(setting);
  }

  chrome.storage.sync.set({ settings: newSettings }, function () {
    closeSettings();
    LoadFeeds();
  });
}
