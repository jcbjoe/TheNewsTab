chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.contentScriptQuery == "GetSettings") {
    GetSettings().then((settings) => sendResponse(settings));
    return true;
  }
  if (request.contentScriptQuery == "GetFeeds") {
    GetFeeds().then((feeds) => sendResponse(feeds));
    return true;
  }
  if (request.contentScriptQuery == "SettingsSaved") {
    CreateAlarm().then(() => sendResponse());
    return true;
  }
  if (request.contentScriptQuery == "ForceRefresh") {
    BuildFeedHtml().then(() => sendResponse());
    return true;
  }
  if (request.contentScriptQuery == "GenerateFeedInfo") {
    GenerateFeedInfo(request.url).then((info) => {
      sendResponse(info);
    });
    return true;
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
        sendResponse();
      });
    });
  }
});

chrome.windows.onCreated.addListener(function () {
  CreateAlarm();
});

async function CreateAlarm() {
  return new Promise((resolve, reject) => {
    chrome.alarms.clearAll(async function () {
      await BuildFeedHtml();
      const settings = await GetSettings();
      const alarmCreateInfo = {
        delayInMinutes: 5,
        periodInMinutes: parseInt(settings["refreshTime"].value),
      };
      chrome.alarms.create("RSSFetcher", alarmCreateInfo);
      resolve();
    });
  });
}

chrome.alarms.onAlarm.addListener(async function (alarm) {
  if (alarm.name == "RSSFetcher") {
    BuildFeedHtml();
  }
});

async function BuildFeedHtml() {
  let news = await BuildNews();

  news.sort((a, b) => b.pubDate - a.pubDate);

  const settings = await GetSettings();

  news = news.slice(0, settings["maxPosts"].value);

  const html = await ConvertNewsToCards(news);

  chrome.storage.local.set({ FeedHtml: html });
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
    let parser = new RSSParser();
    parser.parseURL(url, function (err, feed) {
      if (err) return reject(err);
      resolve(feed);
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

async function GetWebpageSource(url) {
  return new Promise((resolve, reject) => {
    fetch(url)
      .then((response) => response.text())
      .then((str) => resolve(str));
  });
}

async function GetSettings() {
  const settingDefaults = [
    { key: "maxPosts", value: "10", friendlyName: "Maximum Posts", valueType: "number" },
    { key: "refreshTime", value: "5", friendlyName: "Feed Refresh Time", valueType: "number" },
    { key: "showDates", value: true, friendlyName: "Show Dates On Posts", valueType: "boolean" },
  ];

  const settingsPromise = new Promise((resolve, reject) => {
    chrome.storage.sync.get(["settings"], async function (result) {
      if (!result["settings"]) {
        chrome.storage.sync.set({ settings: settingDefaults }, function () {
          resolve(settingDefaults);
        });
      } else {
        // This handles adding new settings - for updates and new installs Also adds new keys to the setting obj if missing
        const settings = result["settings"];
        let someNotFound = false;
        for (const settingDefault of settingDefaults) {
          let found = false;
          let difference = false;
          for (const setting of settings) {
            if (setting.key == settingDefault.key) {
              for (const [key, value] of Object.entries(settingDefault)) {
                if (!Object.keys(setting).includes(key)) {
                  difference = true;
                  setting[key] = value;
                }
              }
              // This removes exsess params on a setting
              const differences = Object.keys(setting).filter((n) => !Object.keys(settingDefault).includes(n));
              if (differences.length > 0) {
                difference = true;
                for (const diff of differences) {
                  delete setting[diff];
                }
              }

              // Just incase a friendly name changes
              if (settingDefault.friendlyName != setting.friendlyName) {
                difference = true;
                setting.friendlyName = settingDefault.friendlyName;
              }

              found = true;
              break;
            }
          }
          if (!found) {
            someNotFound = true;
            settings.push(settingDefault);
          }
          if (difference) {
            someNotFound = true;
          }
        }

        if (someNotFound) {
          chrome.storage.sync.set({ settings: settings }, function () {
            resolve(settings);
          });
        } else {
          resolve(settings);
        }
      }
    });
  });

  const settings = await settingsPromise;

  const settingsFormatted = {};

  for (const setting of settings) {
    settingsFormatted[setting.key] = setting;
  }
  return settingsFormatted;
}

function GetImageFromContent(content) {
  const text = $("<textarea />").html(content).text();
  var parser = new DOMParser();
  var htmlDoc = parser.parseFromString(text, "text/html");
  const img = htmlDoc.querySelector("img");
  if (img) return img.src;
  else null;
}
