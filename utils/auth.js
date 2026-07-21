// utils/auth.js - 登录鉴权工具
var store = require('./store');

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
}

module.exports = {
  requireLogin: requireLogin,
  logout: logout
};
