<template>
  <div>
    <b-button icon-right="cog" @click="isSettingsOpen = true" />
    <section class="section">
      <div class="container">
        <div class="columns">
          <div class="column"></div>
          <div class="column is-two-thirds">
            <b-field>
              <b-input placeholder="Search..." type="search" v-model="searchInput" icon="search" expanded> </b-input>
              <p class="control">
                <b-button label="Search" @click="search" />
              </p>
            </b-field>
          </div>
          <div class="column"></div>
        </div>
      </div>
    </section>
    <section class="section pt-0">
      <div class="container">
        <h2>Top sites</h2>
        <div class="columns">
          <div class="column" v-for="site in topSites.slice(0, 8)" :key="site.url">
            <a :href="site.url">
              <div class="box" style="height: 100px">
                <div style="transform: translateY(50%)">
                  <img :src="'https://s2.googleusercontent.com/s2/favicons?domain=' + site.url" />
                  <br />
                  <p style="white-space: nowrap">{{ site.title | limitTitle }}</p>
                </div>
              </div>
            </a>
          </div>
        </div>
      </div>
    </section>
    <section class="section pt-0">
      <div class="container">
        <h2>My Feed</h2>
        <div class="columns is-multiline">
          <div class="column is-one-fifth" v-for="article in articles" :key="article.link">
            <a :href="article.link">
              <div class="card">
                <div class="card-image">
                  <figure class="image is-4by3"><img :src="article.img" style="object-fit: cover" alt="Placeholder image" /></figure>
                </div>
                <div class="card-content">
                  <div class="news-content">
                    {{ article.title }}
                  </div>
                  <p class="subtitle publisherSubtitle">
                    <img :src="'https://s2.googleusercontent.com/s2/favicons?domain=' + article.link" style="object-fit: cover" />
                    <span style="font-size: 15px">{{ article.publisher }}</span>
                  </p>
                  <p class="subtitle" v-if="this.loaded && GetSetting('showDates').value">
                    <span class="dateSubtitle">{{ article.pubDateRaw | parsePubDate }}</span>
                  </p>
                </div>
              </div>
            </a>
          </div>
        </div>
      </div>
    </section>
    <b-modal v-model="isSettingsOpen" has-modal-card trap-focus :destroy-on-hide="true">
      <template #default="props">
        <settings-modal :settings="settings" :feeds="feeds" @close="props.close()"></settings-modal>
      </template>
    </b-modal>
  </div>
</template>
 
<script>
var Vue = require("vue");

import SettingsModal from "./settings.vue";

import moment from "moment";
import Buefy from "buefy";

Vue.use(Buefy, {
  defaultIconPack: "fas",
});
export default {
  components: {
    SettingsModal,
  },
  data() {
    return {
      isSettingsOpen: false,
      articles: [],
      topSites: [],
      searchInput: "",
      settings: [],
      feeds: [],
      loaded: false,
    };
  },
  async mounted() {
    await this.load();
  },
  methods: {
    async load() {
      this.topSites = await this.GetTopSites();
      this.articles = await this.GetArticles();
      this.settings = await this.GetSettings();
      this.feeds = await this.GetFeeds();

      chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName == "sync") {
          if (changes.settings) {
            this.settings = changes.settings.newValue;
          }
          if (changes.feeds) {
            this.feeds = changes.feeds.newValue;
          }
        }
        if (areaName == "local") {
          if (changes.articles) {
            this.articles = changes.articles.newValue;
          }
        }
      });

      this.loaded = true;
    },
    async GetArticles() {
      const response = await chrome.storage.local.get("articles");
      if (!response) return [];
      if (Object.keys(response).length == 0) return [];
      if (Object.keys(response.articles).length == 0) return [];
      return response.articles;
    },
    async GetFeeds() {
      const response = await chrome.storage.sync.get("feeds");
      if (!response) return [];
      if (Object.keys(response).length == 0) return [];
      if (Object.keys(response.feeds).length == 0) return [];
      return response.feeds;
    },
    async GetTopSites() {
      const sites = await chrome.topSites.get();
      return sites;
    },
    async GetSettings() {
      const response = await chrome.storage.sync.get("settings");
      if (!response) return [];
      if (Object.keys(response).length == 0) return [];
      if (Object.keys(response.settings).length == 0) return [];
      return response.settings;
    },
    GetSetting(key) {
      for (const setting of this.settings) {
        if (setting.key == key) {
          return setting;
        }
      }

      return null;
    },
    search() {
      let searchEngine = "";
      for (const setting of this.settings) {
        if (setting.key == "search") {
          searchEngine = setting.value;
          break;
        }
      }
      let url = "";
      switch (searchEngine) {
        case "Google":
          url = "https://www.google.com/search";
          break;
        case "Bing":
          url = "https://www.bing.com/search";
          break;
        case "Yahoo":
          url = "https://uk.search.yahoo.com/search";
          break;
        case "Duck Duck Go":
          url = "https://duckduckgo.com/";
          break;
        case "Ecosia":
          url = "https://www.ecosia.org/search";
          break;
        case "Brave":
          url = "https://search.brave.com/search";
          break;
        default:
          url = "https://www.google.com/search";
      }

      window.location.href = url + "?q=" + this.searchInput;
    },
  },
  filters: {
    limitTitle: (value) => {
      if (value.length > 14) {
        return value.slice(0, 14) + "...";
      } else {
        return value;
      }
    },
    parsePubDate: (value) => {
      return moment(value).fromNow();
    },
  },
};
</script> 

<style>
.box {
  padding: 10px;
  text-align: center;
  font-size: 14px;
}

.news-content {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  height: 100px;
}

.subtitle {
  padding-top: 5px;
  height: 30px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dateSubtitle {
  font-size: 10px;
}

.publisherSubtitle {
  margin-bottom: 0px !important;
}
</style> 