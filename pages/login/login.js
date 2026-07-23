var store = require('../../utils/store');
var theme = require('../../utils/theme');
var cloud = require('../../utils/cloud');
var auth = require('../../utils/auth');

Page({
  data: {
    colorMode: 'normal',
    showProfile: false,
    avatarUrl: '',
    nickName: '',
    silencing: false,
    silentFail: false
  },

  onLoad: function () {
    var that = this;
    this.unsubTheme = store.subscribe('colorMode', function (m) {
      that.setData({ colorMode: m });
    });

    // 已登录用户保持原有体验，直接进入首页；新用户必须主动选择进入方式。
    var cached = store.getState('user');
    if (cached && cached.openid) {
      wx.redirectTo({ url: '/pages/home/home' });
    }
  },

  onShow: function () {
    theme.injectTheme(this);
  },

  onUnload: function () {
    if (this.unsubTheme) this.unsubTheme();
  },

  handleWechatLogin: function () {
    var that = this;
    if (this.data.silencing) return;
    if (!cloud.isReady()) {
      this.setData({ silentFail: true });
      return;
    }

    this.setData({ silencing: true, silentFail: false });
    cloud.login().then(function (res) {
      var r = res.result || {};
      if (!r.openid) throw new Error('登录结果缺少 openid');
      var user = { openid: r.openid, nickName: r.nickName || '', avatarUrl: r.avatarUrl || '' };
      auth.markWechatLogin();
      store.setState('user', user);
      if (r.isNew || !r.nickName) {
        that.setData({ silencing: false, showProfile: true });
      } else {
        wx.redirectTo({ url: '/pages/home/home' });
      }
    }).catch(function (err) {
      console.error('[微信登录] 失败', err);
      that.setData({ silencing: false, silentFail: true });
    });
  },

  handleGuest: function () {
    auth.enterGuest();
    wx.redirectTo({ url: '/pages/home/home' });
  },

  onChooseAvatar: function (e) {
    this.setData({ avatarUrl: e.detail.avatarUrl });
  },

  onNickBlur: function (e) {
    this.setData({ nickName: e.detail.value });
  },

  onNickInput: function (e) {
    this.setData({ nickName: e.detail.value });
  },

  saveProfile: function () {
    var that = this;
    var nickName = (this.data.nickName || '').trim();
    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    var avatarUrl = this.data.avatarUrl;
    var user = store.getState('user') || {};

    if (cloud.isReady()) {
      wx.showLoading({ title: '保存中' });
      var avatarTask = avatarUrl && avatarUrl.indexOf('wxfile://') === 0
        ? cloud.uploadAvatar(avatarUrl).then(function (up) { return up.fileID; })
        : Promise.resolve(avatarUrl || '');
      avatarTask.then(function (fileID) {
        return cloud.updateProfile(nickName, fileID).then(function () { return fileID; });
      }).then(function (fileID) {
        wx.hideLoading();
        store.setState('user', { openid: user.openid, nickName: nickName, avatarUrl: fileID });
        wx.redirectTo({ url: '/pages/home/home' });
      }).catch(function (err) {
        wx.hideLoading();
        console.error('保存资料失败，保留本地资料', err);
        store.setState('user', { openid: user.openid, nickName: nickName, avatarUrl: avatarUrl });
        wx.redirectTo({ url: '/pages/home/home' });
      });
    } else {
      store.setState('user', { openid: user.openid, nickName: nickName, avatarUrl: avatarUrl });
      wx.redirectTo({ url: '/pages/home/home' });
    }
  },

  skipProfile: function () {
    wx.redirectTo({ url: '/pages/home/home' });
  }
});
