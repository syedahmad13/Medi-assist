// runs before the page paints so there is no light flash; saved choice wins, else the OS setting
try {
  var t = localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = t;
} catch (e) {}
