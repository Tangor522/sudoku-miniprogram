var store = require('../../utils/store');
var theme = require('../../utils/theme');
var auth = require('../../utils/auth');

Page({
  data: {
    colorMode: 'normal',
    user: null,
    firstLetter: '?'
  },

  onLoad: function () {
    var that = this;
    this.unsubTheme = store.subscribe('colorMode', function (m) {
      that.setData({ colorMode: m });
    });
    this.unsubUser = store.subscribe('user', function (u) {
      that.setData({
        user: u,
        firstLetter: (u && u.nickName) ? u.nickName.charAt(0).toUpperCase() : '?'
      });
    });
  },

  onShow: function () {
    theme.injectTheme(this);
    var user = store.getState('user');
    this.setData({
      user: user,
      firstLetter: (user && user.nickName) ? user.nickName.charAt(0).toUpperCase() : '?'
    });
  },

  onUnload: function () {
    if (this.unsubTheme) this.unsubTheme();
    if (this.unsubUser) this.unsubUser();
  },

  // 切换配色
  setColorMode: function (e) {
    theme.setColorMode(e.currentTarget.dataset.mode);
  },

  go4x4: function () {
    wx.navigateTo({ url: '/pages/game4x4/game4x4' });
  },

  go6x6: function () {
    wx.navigateTo({ url: '/pages/game6x6/game6x6' });
  },

  go9x9: function () {
    wx.navigateTo({ url: '/pages/game9x9/game9x9' });
  },

  goStats: function () {
    wx.navigateTo({ url: '/pages/stats/stats' });
  },

  goRanking: function () {
    if (!store.getState('user')) {
      wx.navigateTo({ url: auth.loginUrl('ranking') });
      return;
    }
    wx.navigateTo({ url: '/pages/ranking/ranking' });
  },

  goPk: function () {
    if (!store.getState('user')) {
      wx.navigateTo({ url: auth.loginUrl('pk') });
      return;
    }
    wx.navigateTo({ url: '/pages/pk_lobby/pk_lobby' });
  },

  handleAvatarTap: function () {
    if (!store.getState('user')) {
      wx.navigateTo({ url: auth.loginUrl('home') });
      return;
    }
    this.handleLogout();
  },

  handleLogout: function () {
    wx.showModal({
      title: '退出登录',
      content: '确定退出登录吗？',
      success: function (res) {
        if (res.confirm) {
          auth.logout();
          wx.reLaunch({ url: '/pages/home/home' });
        }
      }
    });
  }
});
