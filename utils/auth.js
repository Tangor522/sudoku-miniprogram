// utils/auth.js - 登录鉴权工具
var store = require('./store');

// 检查登录态，未登录跳转登录页。在 page 的 onLoad/onShow 调用
function loginUrl(from) {
  var allowed = {
    home: true, ranking: true, pk: true,
    game4x4: true, game6x6: true, game9x9: true
  };
  var target = allowed[from] ? from : 'home';
  return '/pages/login/login?from=' + target;
}

function requireLogin(from) {
  var user = store.getState('user');
  if (!user) {
    wx.redirectTo({ url: loginUrl(from) });
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
  loginUrl: loginUrl,
  logout: logout
};
