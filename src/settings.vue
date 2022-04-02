<template>
  <div class="modal-card" style="width: auto">
    <header class="modal-card-head">
      <p class="modal-card-title">Settings</p>
      <button type="button" class="delete" @click="$emit('close')" />
    </header>
    <section class="modal-card-body">
      <div class="content">
        <h2>General Settings</h2>
        <table style="width: 100%">
          <thead>
            <tr>
              <td>Setting</td>
              <td>Value</td>
            </tr>
          </thead>
          <tbody>
            <tr v-for="setting in settings" :key="setting.id">
              <td>{{ setting.friendlyName }}</td>
              <td>
                <b-checkbox v-if="setting.valueType == 'boolean'" v-model="setting.value"></b-checkbox>
                <b-select v-else-if="setting.valueType == 'dropdown'" v-model="setting.value" expanded>
                  <option v-for="valueType in setting.valueTypes" :value="valueType" :key="valueType">
                    {{ valueType }}
                  </option>
                </b-select>
                <b-input v-else size="small" type="text" v-model="setting.value" expanded />
              </td>
            </tr>
          </tbody>
        </table>
        <h2>News Feeds</h2>
        <table style="width: 100%">
          <thead>
            <tr>
              <td>RSS Name</td>
              <td class="centre-column">Enabled</td>
              <td class="centre-column">Delete</td>
            </tr>
          </thead>
          <tbody>
            <tr v-for="feed in feeds" :key="feed.url">
              <td v-if="feed.failed">{{ feed.rssLink }} - (Failed To Get Feed)</td>
              <td v-else>{{ feed.title }}</td>
              <td><b-checkbox v-model="feed.enabled"></b-checkbox></td>
              <td><b-button size="small" type="is-danger" @click="removeFeed(feed.rssLink)" icon-right="times" /></td>
            </tr>
          </tbody>
        </table>
        <b-field label="Add new feed">
          <b-input size="small" expanded type="text" v-model="rssInput" placeholder="Type an RSS URL" />
          <p class="control">
            <b-button size="small" type="is-success" @click="addFeed(rssInput)"><i class="fas fa-plus"></i></b-button>
          </p>
        </b-field>
        <h2>Advanced Settings</h2>
        <b-button type="is-warning" @click="clearCache()">Clear Local Cache</b-button>
        <b-button type="is-danger" @click="resetFeeds()">Reset RSS feeds</b-button>
        <b-button type="is-danger" @click="resetSettings()">Reset Settings</b-button>
      </div>
    </section>
    <footer class="modal-card-foot">
      <b-button label="Save Changes" @click="save" type="is-success" />
      <b-button label="Close" @click="$emit('close')" />
    </footer>
    <b-loading v-model="isLoading"></b-loading>
  </div>
</template>
 
<script>
export default {
  props: {
    settings: {
      type: Array,
      required: true,
    },
    feeds: {
      type: Array,
      required: true,
    },
  },
  data() {
    return {
      isLoading: false,
      rssInput: "",
    };
  },
  mounted() {},
  methods: {
    addFeed(url) {
      this.isLoading = true;
      for (const feed of this.feeds) {
        if (feed.rssLink == url) {
          this.$buefy.toast.open({
            message: url + " has already been added!",
            type: "is-danger",
          });
          this.isLoading = false;
          return;
        }
      }
      chrome.runtime.sendMessage({ contentScriptQuery: "AddFeed", url: url }, async (res) => {
        if (res) {
          this.$buefy.toast.open({
            message: url + " has been added!",
            type: "is-success",
          });
        } else {
          this.$buefy.toast.open({
            message: "Failed to add the feed: " + url + "!",
            type: "is-danger",
          });
        }

        this.rssInput = "";
        this.isLoading = false;
      });
    },
    removeFeed(url) {
      this.isLoading = true;
      chrome.runtime.sendMessage({ contentScriptQuery: "RemoveFeed", url: url }, async () => {
        this.$buefy.toast.open({
          message: url + " has been removed!",
          type: "is-danger",
        });
        this.isLoading = false;
      });
    },
    resetSettings() {
      this.isLoading = true;
      chrome.runtime.sendMessage({ contentScriptQuery: "ResetSettings" }, async () => {
        this.$buefy.toast.open({
          message: "The settings have been reset!",
          type: "is-success",
        });
        this.isLoading = false;
      });
    },
    resetFeeds() {
      this.isLoading = true;
      chrome.runtime.sendMessage({ contentScriptQuery: "ResetFeeds" }, async () => {
        this.$buefy.toast.open({
          message: "The RSS Feeds have been reset!",
          type: "is-success",
        });
        this.isLoading = false;
      });
    },
    clearCache() {
      this.isLoading = true;
      chrome.runtime.sendMessage({ contentScriptQuery: "ClearCache" }, () => {
        this.$buefy.toast.open({
          message: "The cache has been cleared!",
          type: "is-success",
        });
        this.isLoading = false;
      });
    },
    async save() {
      this.isLoading = true;
      await chrome.storage.sync.set({ feeds: this.feeds });
      await chrome.storage.sync.set({ settings: this.settings });
      chrome.runtime.sendMessage({ contentScriptQuery: "SettingsSaved" }, () => {
        this.$buefy.toast.open({
          message: "Settings successfully saved!",
          type: "is-success",
        });
        this.isLoading = false;
      });
    },
  },
};
</script> 

<style>
@media (prefers-color-scheme: dark) {
  .modal-card-body {
    background-color: #17181c;
  }
  tr:last-child {
    border-bottom: 1px solid;
    border-color: #363636;
  }
}
</style> 