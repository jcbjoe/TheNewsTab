let theme = localStorage.getItem("theme") || "system";
if (theme == "system") {
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    theme = "dark";
  } else {
    theme = "light";
  }
}
document.documentElement.setAttribute("data-theme", theme);
