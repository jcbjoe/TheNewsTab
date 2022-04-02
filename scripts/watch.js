const chokidar = require("chokidar");
const common = require("./common.js");

console.log("Building...");
common.build();
console.log("Building Complete!");

console.log("Watching ./src");
chokidar.watch("./src").on("change", (event, path) => {
  console.log("Found changes: " + event);
  try {
    console.log("Building...");
    common.build();
    console.log("Building Complete!");
  } catch (e) {
    console.log("Build Error:", e.message);
  }
});
