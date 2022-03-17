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
    CreateAlarm().then(() => {
      BuildFeedHtml().then(() => sendResponse());
    });
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

chrome.runtime.onInstalled.addListener(function (details) {
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

  const html = await ConvertNewsToCards(news, settings["showDates"].value);

  chrome.storage.local.set({ FeedHtml: html });
}

async function BuildNews() {
  const feeds = await GetFeeds();

  const news = [];

  for (const feed of feeds) {
    if (feed.enabled && !feed.failed) {
      try {
        const rss = await GetRSS(feed.rssLink);
        for (const item of rss.items) {
          item.publisher = rss.title;
          item.pubDate = new Date(item.pubDate);
          news.push(item);
        }
      } catch (e) {
        console.log("Failed to load feed: " + feed.rssLink, e);
      }
    }
  }

  return news;
}

async function GetFeeds() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["feeds"], async function (result) {
      if (!result["feeds"]) {
        const defaultFeedUrls = [
          "http://theverge.com/rss/index.xml",
          "http://feeds.bbci.co.uk/news/rss.xml?edition=uk",
          "http://feeds.macrumors.com/MacRumors-All",
          "https://fselite.net/feed",
        ];

        const feeds = [];

        for (const defaultFeedUrl of defaultFeedUrls) {
          const feedinfo = await GenerateFeedInfo(defaultFeedUrl);
          feeds.push(feedinfo);
        }

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
  const feedObj = {
    link: "",
    title: "",
    favicon: "",
    rssLink: url,
    enabled: true,
    failed: false,
  };

  try {
    const rssData = await GetRSS(url);
    feedObj.link = rssData.link;
    feedObj.title = rssData.title;
    feedObj.favicon = `https://s2.googleusercontent.com/s2/favicons?domain=${rssData.link}`;
  } catch (e) {
    feedObj.link = url;
    feedObj.title = url;
    feedObj.failed = true;
    console.log("Failed to parse RSS: " + url, e);
  }

  return feedObj;
}

async function ConvertNewsToCards(news, showDate = false) {
  let html = "";
  for (const article of news) {
    let img = GetImageFromContent(article.content);
    if (img == null) {
      img = await GetImageFromURL(article.link);
    }
    article.img = img;
    let date = "";
    if (showDate) {
      date = '<p class="subtitle"><span class="dateSubtitle">' + moment(article.pubDate).fromNow() + "</span></p>";
    }

    html += `<div class="column is-one-fifth"><a href="${article.link}">
                    <div class="card">
                        <div class="card-image">
                            <figure class="image is-4by3">
                            <img src="${img}" style="object-fit: cover;" alt="Placeholder image">
                            </figure>
                        </div>
                        <div class="card-content">
                            <div class="news-content">${article.title}</div>
                            <p class="subtitle publisherSubtitle">
                            <img src="https://s2.googleusercontent.com/s2/favicons?domain=${article.link}"> <span style="font-size: 15px;">${article.publisher}</span>
                            </p>
                            ${date}
                        </div>
                    </div></a>
                </div>`;
  }
  return html;
}

async function GetRSS(url) {
  const contents = await axios.get(url);
  const xml = contents.data.replace(/&(?!(?:apos|quot|[gl]t|amp);|#)/g, "&amp;");
  let parser = new RSSParser();
  const feed = await parser.parseString(xml);
  return feed;
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
    {
      key: "search",
      value: true,
      friendlyName: "Search Engine",
      valueType: "dropdown",
      valueTypes: ["Google", "Bing", "Yahoo", "Duck Duck Go", "Ecosia", "Brave"],
    },
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
