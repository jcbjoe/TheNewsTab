SetupModal();

LoadTopSites();

BuildFeedPage();

CleanUpUrls();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName == "local") {
    if (changes.FeedHtml) {
      if (!changes.FeedHtml.newValue) {
        document.getElementById("news").innerHTML = "";
      } else {
        document.getElementById("news").innerHTML = changes.FeedHtml.newValue;
      }
    }
  }
});

async function LoadTopSites() {
  chrome.topSites.get((sites) => {
    let innerSites = "";
    sites = sites.slice(0, 8);
    sites.forEach((site) => {
      let title = site.title;
      if (title.length > 14) {
        title = title.slice(0, 14) + "...";
      }
      innerSites += `
      <div class="column">
        <a href="${site.url}">
        <div class="box" style="height: 100px;">
          <div style="transform: translateY(50%);">
            <img alt="${title}" src="https://s2.googleusercontent.com/s2/favicons?domain=${site.url}">
            <br>
            <p style="white-space: nowrap;">${title}</p>
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

async function BuildFeedPage() {
  chrome.storage.local.get("FeedHtml", function (items) {
    if (items.FeedHtml) {
      document.getElementById("news").innerHTML = items.FeedHtml;
    }
  });
}

function closeSettings() {
  var modal = document.querySelector(".modal"); // assuming you have only 1
  var html = document.querySelector("html");

  modal.classList.remove("is-active");
  html.classList.remove("is-clipped");
}

async function clearLocalStorage() {
  return new Promise((resolve, reject) => {
    SetModalLoading(true);
    chrome.storage.local.clear(function () {
      var error = chrome.runtime.lastError;
      if (error) reject(error);
      else {
        chrome.runtime.sendMessage({ contentScriptQuery: "ForceRefresh" }, (data) => {
          SetModalLoading(false);
          resolve();
        });
      }
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
    SetModalLoading(true);
    chrome.storage.sync.remove("settings", async function () {
      var error = chrome.runtime.lastError;
      if (error) reject(error);
      else {
        // This adds the defaults back
        await GetSettings();
        await OpenGeneralSettings();
        SetModalLoading(false);
        resolve();
      }
    });
  });
}

async function ResetRssFeeds() {
  return new Promise((resolve, reject) => {
    SetModalLoading(true);
    chrome.storage.sync.remove("feeds", async function () {
      var error = chrome.runtime.lastError;
      if (error) reject(error);
      else {
        // This adds the defaults back
        await GetFeeds();
        await OpenRssSettings();
        SetModalLoading(false);
        resolve();
      }
    });
  });
}

async function CleanUpUrls() {
  chrome.runtime.sendMessage({ contentScriptQuery: "cacheClean" });
}

async function OpenGeneralSettings() {
  document.getElementById("settings-general").innerHTML = "";

  const settings = await GetSettings();

  let generalHtml = "<table style='width:100%'><thead><tr><td>Setting</td><td>Value</td></tr></thead><tbody id='settings-general-table'>";

  for (const [key, setting] of Object.entries(settings)) {
    let valueHtml = "";
    switch (setting.valueType) {
      case "boolean":
        let checked = "";
        if (setting.value == "1") checked = "checked";
        valueHtml = `<input data-key="${setting.key}" type="checkbox" ${checked}>`;
        break;
      default:
        valueHtml = `<input data-key="${setting.key}" class="input is-small" type="text" value="${setting.value}">`;
    }
    generalHtml += `<tr><td>${setting.friendlyName}</td><td>${valueHtml}</td></tr>`;
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
    feedHtml += `<tr><td>${feed.title}</td><td class='centre-column'><input class="rss-enable-checkbox" type="checkbox" data-url="${feed.rssLink}" ${checked}></td><td class='centre-column'><button data-url="${feed.rssLink}" class="button is-small RssDeleteBtn"><i class="fas fa-times"></i></button></td></tr>`;
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
  SetModalLoading(true);
  const rssFeed = await GenerateFeedInfo(url);

  const feeds = await GetFeeds();

  feeds.push(rssFeed);

  chrome.storage.sync.set({ feeds: feeds }, function () {
    chrome.runtime.sendMessage({ contentScriptQuery: "ForceRefresh" }, (data) => {});
    OpenRssSettings();
    SetModalLoading(false);
  });
}

async function GenerateFeedInfo(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ contentScriptQuery: "GenerateFeedInfo", url: url }, (data) => {
      resolve(data);
    });
  });
}

async function RemoveRss(url) {
  SetModalLoading(true);
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
    chrome.runtime.sendMessage({ contentScriptQuery: "ForceRefresh" }, (data) => {});
    OpenRssSettings();
    SetModalLoading(false);
  });
}

async function GetSettings() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ contentScriptQuery: "GetSettings" }, async (data) => {
      resolve(data);
    });
  });
}

async function GetFeeds() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ contentScriptQuery: "GetFeeds" }, async (data) => {
      resolve(data);
    });
  });
}

async function SaveSettings() {
  SetModalLoading(true);
  const settingContainerChildren = document.getElementById("settings-general-table").childNodes;

  const settings = await GetSettings();

  for (const node of settingContainerChildren) {
    const input = node.querySelector("input");
    const key = input.dataset.key;

    let inputVal = input.value;
    if (input.type == "checkbox") inputVal = input.checked;

    const settingVal = settings[key];
    settingVal.value = inputVal;
    settings[key] = settingVal;
  }

  const newSettings = [];

  for (const [key, setting] of Object.entries(settings)) {
    newSettings.push(setting);
  }

  const rssCheckboxes = document.getElementsByClassName("rss-enable-checkbox");
  const feeds = await GetFeeds();
  for (const checkbox of rssCheckboxes) {
    const url = checkbox.dataset.url;
    const value = checkbox.checked;

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
      feeds[index].enabled = value;
    }
  }

  chrome.storage.sync.set({ settings: newSettings, feeds: feeds }, function () {
    chrome.runtime.sendMessage({ contentScriptQuery: "SettingsSaved" }, (data) => {
      SetModalLoading(false);
      closeSettings();
    });
  });
}

async function SetModalLoading(loading) {
  if (loading) {
    $(".loader-wrapper").addClass("is-active");
  } else {
    $(".loader-wrapper").removeClass("is-active");
  }
}
