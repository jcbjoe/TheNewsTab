import Parser from "rss-parser";
import { parse } from "node-html-parser";
import { decode } from "html-entities";

chrome.windows.onCreated.addListener(function () {
  CreateAlarm();
});

chrome.runtime.onInstalled.addListener(function (details) {
  CreateAlarm();
});

const faviconDomain = "https://s2.googleusercontent.com/s2/favicons?domain=";

async function CreateAlarm() {
  await chrome.alarms.clearAll();

  const delay = await GetSetting("refreshTime");

  const alarmCreateInfo = {
    delayInMinutes: 0,
    periodInMinutes: parseInt(delay.value),
  };
  chrome.alarms.create("TheNewsTabAlarm", alarmCreateInfo);

  const invalidateCacheOptions = {
    delayInMinutes: 24,
    periodInMinutes: 24,
  };
  chrome.alarms.create("InvalidateCache", invalidateCacheOptions);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name == "TheNewsTabAlarm") {
    await UpdateFeeds();
  }
  if (alarm.name == "InvalidateCache") {
    await InvalidateCache();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  HandleMessage(request, sender).then((res) => sendResponse(res));

  // This keeps the message channel open
  return true;
});

async function HandleMessage(request, sender) {
  let response = null;

  switch (request.contentScriptQuery) {
    case "SettingsSaved":
      CreateAlarm();
      response = true;
      break;
    case "ClearCache":
      await ClearCache();
      response = true;
      break;

    case "ResetSettings":
      await ResetSettings();
      response = true;
      break;

    case "ResetFeeds":
      await ResetFeeds();
      await UpdateFeeds();
      response = true;
      break;

    case "AddFeed":
      const res = await AddFeed(request.url);
      response = res;
      break;

    case "RemoveFeed":
      await RemoveFeed(request.url);
      response = true;
      break;

    default:
      break;
  }

  return response;
}

async function ClearCache() {
  await chrome.storage.local.remove("imageCache");
}

async function ResetSettings() {
  await chrome.storage.sync.remove("settings");
}

async function ResetFeeds() {
  await chrome.storage.sync.remove("feeds");
  await chrome.storage.local.remove("articles");
}

async function InvalidateCache() {
  const imageCache = await chrome.storage.local.get("imageCache");
  if (imageCache["imageCache"]) {
    const dateNow = new Date();
    const imageCacheMap = new Map(imageCache["imageCache"]);
    const keysToRemove = [];
    dateNow.setHours(dateNow.getHours() + 2);
    for (const [key, value] of imageCacheMap.entries()) {
      if (new Date(value.lastAccessed) > dateNow) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      imageCacheMap.delete(key);
    }
    await chrome.storage.local.set({ imageCache: Array.from(imageCacheMap) });
  }
}

async function UpdateFeeds() {
  const [feeds, feedData] = await GetFeeds();

  const maxPosts = await GetSetting("maxPosts");

  const articles = await GetArticles(feedData, parseInt(maxPosts.value));

  await chrome.storage.sync.set({ feeds: feeds });
  await chrome.storage.local.set({ articles: articles });
}

async function AddFeed(url) {
  try {
    const [feeds] = await GetFeeds();

    let found = false;
    for (const feed of feeds) {
      if (feed.rssLink == url) {
        found = true;
        break;
      }
    }

    if (found) return false;

    const rssData = await ParseRssUrl(url);

    feeds.push({
      title: rssData.title,
      favicon: faviconDomain + rssData.link,
      link: rssData.link,
      rssLink: url,
      enabled: true,
      failed: false,
    });

    await chrome.storage.sync.set({ feeds: feeds });

    await UpdateFeeds();

    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function RemoveFeed(url) {
  const [feeds] = await GetFeeds();

  const feedsNew = feeds.filter((feed) => {
    return feed.rssLink != url;
  });

  await chrome.storage.sync.set({ feeds: feedsNew });
}

async function GetFeeds() {
  let feedUrls = [];
  const feedsRes = await chrome.storage.sync.get("feeds");
  if (feedsRes.feeds) {
    for (const feed of feedsRes.feeds) {
      feedUrls.push(feed.rssLink);
    }
  } else {
    feedUrls = [
      "http://theverge.com/rss/index.xml",
      "http://feeds.bbci.co.uk/news/rss.xml?edition=uk",
      "http://feeds.macrumors.com/MacRumors-All",
      "https://fselite.net/feed",
    ];
  }

  const feeds = [];
  const feedData = [];

  for (const feedUrl of feedUrls) {
    try {
      const rssData = await ParseRssUrl(feedUrl);
      feedData.push(rssData);

      feeds.push({
        title: rssData.title,
        favicon: faviconDomain + rssData.link,
        link: rssData.link,
        rssLink: feedUrl,
        enabled: true,
        failed: false,
      });
    } catch (e) {
      feeds.push({
        title: "",
        favicon: "",
        link: "",
        rssLink: feedUrl,
        enabled: true,
        failed: true,
      });
      console.error("Failed to parse RSS: " + feedUrl, e);
    }
  }

  return [feeds, feedData];
}

async function GetArticles(feeds, maxArticles = 10) {
  let articles = [];
  for (const feed of feeds) {
    for (const article of feed.items) {
      const newArticle = {};
      newArticle.pubDate = new Date(article.pubDate);
      newArticle.pubDateRaw = article.pubDate;
      newArticle.link = article.link;
      let img = GetImageFromPageContent(article.content);
      if (!img) {
        img = await GetImageFromURL(article.link);
      }
      newArticle.img = img;
      newArticle.title = decode(article.title);
      newArticle.publisher = feed.title;
      articles.push(newArticle);
    }
  }
  articles = articles.sort((a, b) => b.pubDate - a.pubDate);
  articles = articles.splice(0, maxArticles);
  return articles;
}

async function ParseRssUrl(url) {
  const contents = await GetWebpageSource(url);
  const xml = contents.replace(/&(?!(?:apos|quot|[gl]t|amp);|#)/g, "&amp;");
  const parser = new Parser();
  const feed = await parser.parseString(xml);
  return feed;
}

async function GetImageFromURL(url) {
  const imageCacheRes = await chrome.storage.local.get("imageCache");
  let map = new Map();

  if (imageCacheRes.imageCache) map = new Map(imageCacheRes.imageCache);

  if (map.has(url)) {
    map.set(url, {
      imgUrl: map.get(url).imgUrl,
      lastAccessed: new Date().toISOString(),
    });

    await chrome.storage.local.set({ imageCache: Array.from(map) });
    return map.get(url).imgUrl;
  } else {
    const data = await GetWebpageSource(url);

    const root = parse(data);
    const meta = root.querySelector('meta[property="og:image"]');
    var value = meta && meta.getAttribute("content");

    //TODO: Add logic for image not found
    map.set(url, {
      imgUrl: value,
      lastAccessed: new Date().toISOString(),
    });

    await chrome.storage.local.set({ imageCache: Array.from(map) });
    return value;
  }
}

async function GetWebpageSource(url) {
  const res = await fetch(url, {
    method: "GET",
    mode: "cors",
  });
  const contents = await res.text();

  return contents;
}

function GetImageFromPageContent(content) {
  const root = parse(content);
  const img = root.querySelector("img");
  if (img && img.attributes && img.attributes.src) {
    return img.attributes.src;
  } else {
    return false;
  }
}

async function GetSettings() {
  const settingDefaults = [
    {
      key: "maxPosts",
      value: "10",
      friendlyName: "Maximum Posts",
      valueType: "number",
    },
    {
      key: "refreshTime",
      value: "5",
      friendlyName: "Feed Refresh Time",
      valueType: "number",
    },
    {
      key: "showDates",
      value: true,
      friendlyName: "Show Dates On Posts",
      valueType: "boolean",
    },
    {
      key: "search",
      value: "Google",
      friendlyName: "Search Engine",
      valueType: "dropdown",
      valueTypes: ["Google", "Bing", "Yahoo", "Duck Duck Go", "Ecosia", "Brave"],
    },
  ];

  const settingsPromise = new Promise((resolve, reject) => {
    chrome.storage.sync.get("settings", async function (result) {
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

  return settings;
}

async function GetSetting(key) {
  const settings = await GetSettings();

  for (const setting of settings) {
    if (setting.key == key) {
      return setting;
    }
  }

  return null;
}
