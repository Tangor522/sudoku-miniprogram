// utils/theme.js - 主题切换工具
var store = require('./store');

function getColorMode() {
  return store.getState('colorMode') || 'normal';
}

function setColorMode(mode) {
  if (['normal', 'soft', 'eye-care'].indexOf(mode) === -1) return;
  store.setState('colorMode', mode);
}

// 在 page 的 onShow 调用，把当前主题注入 page data
function injectTheme(page) {
  page.setData({ colorMode: getColorMode() });
}

module.exports = {
  getColorMode: getColorMode,
  setColorMode: setColorMode,
  injectTheme: injectTheme
};
