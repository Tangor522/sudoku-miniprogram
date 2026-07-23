// utils/auth.js - 登录鉴权工具
var store = require('./store');

function setGuestMode(value) {
  var app = getApp();
  if (app && app.globalData) app.globalData.guestMode = value;
}

function isGuest() {
  return !store.getState('user') && wx.getStorageSync('authMode') === 'guest';
}

function hasAccessChoice() {
  return !!store.getState('user') || isGuest();
}

function enterGuest() {
  store.setState('user', null);
  wx.setStorageSync('authMode', 'guest');
  setGuestMode(true);
}

function markWechatLogin() {
  wx.setStorageSync('authMode', 'wechat');
  setGuestMode(false);
}

// 检查登录态，未登录跳转登录页。在 page 的 onLoad/onShow 调用
function requireLogin() {
  var user = store.getState('user');
  if (!user) {
    wx.redirectTo({ url: '/pages/login/login' });
    return false;
  }
  return true;
}

// 登出
function logout() {
  store.setState('user', null);
  wx.removeStorageSync('authMode');
  setGuestMode(false);
}

module.exports = {
  requireLogin: requireLogin,
  logout: logout,
  isGuest: isGuest,
  hasAccessChoice: hasAccessChoice,
  enterGuest: enterGuest,
  markWechatLogin: markWechatLogin
};
