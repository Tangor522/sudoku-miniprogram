// utils/store.js - 全局状态管理（globalData 封装 + 发布订阅）
// 替代 React 的单向数据流，让 user/colorMode 等全局状态跨 page 同步

var listeners = { user: {}, colorMode: {} };
var listenerId = 0;

function getState(key) {
  return getApp().globalData[key];
}

function setState(key, value) {
  var app = getApp();
  app.globalData[key] = value;

  // 同步到本地缓存
  if (key === 'user') {
    if (value) wx.setStorageSync('currentUser', value);
    else wx.removeStorageSync('currentUser');
  }
  if (key === 'colorMode') {
    wx.setStorageSync('colorMode', value);
  }

  // 通知订阅者
  var subs = listeners[key] || {};
  Object.keys(subs).forEach(function (id) {
    try { subs[id](value); } catch (e) {
      console.error('[store] listener error', e);
    }
  });
}

function subscribe(key, fn) {
  if (!listeners[key]) listeners[key] = {};
  var id = 'l' + (++listenerId);
  listeners[key][id] = fn;
  return function unsubscribe() {
    delete listeners[key][id];
  };
}

module.exports = {
  getState: getState,
  setState: setState,
  subscribe: subscribe
};
