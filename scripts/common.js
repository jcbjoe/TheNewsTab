const fs = require("fs-extra");
const browserify = require("browserify");
const vueify = require("vueify");

module.exports = {
  build: function (a, b) {
    if (fs.existsSync("./dist")) {
      fs.rmSync("dist", { recursive: true, force: true });
    }
    fs.mkdirSync("dist");
    fs.mkdirSync("dist/vendor");

    fs.copyFileSync("src/newtab.html", "dist/newtab.html");
    fs.copyFileSync("src/manifest.json", "dist/manifest.json");

    fs.copySync("src/vendor", "dist");

    const options = {};
    if (process.env.NODE_ENV != "production") options.debug = true;

    browserify("./src/main.js", options)
      .transform(vueify, { presets: ["es2015"] })
      .bundle()
      .pipe(fs.createWriteStream("dist/bundle.js"));

    browserify("./src/background.js", options)
      .transform("babelify", { presets: ["es2015"] })
      .bundle()
      .pipe(fs.createWriteStream("dist/background.bundle.js"));
  },
};
