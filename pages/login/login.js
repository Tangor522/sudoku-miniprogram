var store = require('../../utils/store');
var theme = require('../../utils/theme');
var cloud = require('../../utils/cloud');
var storage = require('../../utils/storage');

Page({
  data: {
    colorMode: 'normal',
    showProfile: false,   // 是否显示资料补全
    avatarUrl: '',
    nickName: '',
    isLocalMode: false,   // 是否本地存储模式（云开发未开通）
    silencing: true,      // 静默登录进行中（控制 UI：显示 loading 还是登录按钮）
    silentFail: false     // 静默登录失败，需展示手动登录按钮
  },

  onLoad: function () {
    var that = this;
    this.unsubTheme = store.subscribe('colorMode', function (m) {
      that.setData({ colorMode: m });
    });
    // 进页面立即静默登录，用户无需点按钮
    this.silentLogin();
  },

  onShow: function () {
    theme.injectTheme(this);
    this.setData({ isLocalMode: !cloud.isReady() });
  },

  onUnload: function () {
    if (this.unsubTheme) this.unsubTheme();
  },

  // 静默登录：自动尝试，老用户直接进首页，新用户弹资料补全
  silentLogin: function () {
    var that = this;
    this.setData({ silencing: true, silentFail: false });

    // 1. 缓存命中（app.onLaunch 已恢复到 globalData），直接进首页
    var cached = store.getState('user');
    if (cached && cached.openid) {
      wx.redirectTo({ url: '/pages/home/home' });
      return;
    }

    // 2. 云开发模式：静默调云函数换 openid（用户无感）
    if (cloud.isReady()) {
      cloud.login().then(function (res) {
        var r = res.result || {};
        var user = { openid: r.openid, nickName: r.nickName || '', avatarUrl: r.avatarUrl || '' };
        store.setState('user', user);
        if (r.isNew || !r.nickName) {
          // 首次登录或资料缺失，弹资料补全
          that.setData({ silencing: false, showProfile: true });
        } else {
          // 老用户，直接进首页
          wx.redirectTo({ url: '/pages/home/home' });
        }
      }).catch(function (err) {
        console.error('[静默登录] 云函数失败，降级手动', err);
        that.setData({ silencing: false, silentFail: true });
      });
    } else {
      // 3. 本地模式：静默生成临时用户
      // 检查是否之前填过昵称（用单独缓存标记，避免清缓存后反复弹资料补全）
      var hasProfile = wx.getStorageSync('hasProfile');
      var user = storage.genLocalUser();
      if (hasProfile && hasProfile.nickName) {
        // 之前填过，复用昵称头像
        user.nickName = hasProfile.nickName;
        user.avatarUrl = hasProfile.avatarUrl || '';
        store.setState('user', user);
        wx.redirectTo({ url: '/pages/home/home' });
      } else {
        // 首次，生成用户后弹资料补全
        store.setState('user', user);
        that.setData({ silencing: false, showProfile: true });
      }
    }
  },

  // 手动登录（静默失败时的兜底）
  handleLogin: function () {
    this.silentLogin();
  },

  onChooseAvatar: function (e) {
    this.setData({ avatarUrl: e.detail.avatarUrl });
  },

  // iOS 用 blur 取值
  onNickBlur: function (e) {
    this.setData({ nickName: e.detail.value });
  },
  onNickInput: function (e) {
    this.setData({ nickName: e.detail.value });
  },

  // 保存资料
  saveProfile: function () {
    var that = this;
    var nickName = (this.data.nickName || '').trim();
    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    var avatarUrl = this.data.avatarUrl;
    var user = store.getState('user') || {};

    if (cloud.isReady() && avatarUrl && avatarUrl.indexOf('wxfile://') === 0) {
      // 云开发模式：头像临时路径上传云存储换永久 fileID
      wx.showLoading({ title: '保存中' });
      cloud.uploadAvatar(avatarUrl).then(function (up) {
        var fileID = up.fileID;
        return cloud.updateProfile(nickName, fileID).then(function () {
          return fileID;
        });
      }).then(function (fileID) {
        wx.hideLoading();
        store.setState('user', {
          openid: user.openid,
          nickName: nickName,
          avatarUrl: fileID
        });
        wx.redirectTo({ url: '/pages/home/home' });
      }).catch(function (err) {
        wx.hideLoading();
        console.error('保存资料失败，降级本地', err);
        // 本地模式标记已填资料
        wx.setStorageSync('hasProfile', { nickName: nickName, avatarUrl: avatarUrl });
        store.setState('user', { openid: user.openid, nickName: nickName, avatarUrl: avatarUrl });
        wx.redirectTo({ url: '/pages/home/home' });
      });
    } else {
      // 本地模式：标记已填昵称，避免下次再弹
      wx.setStorageSync('hasProfile', { nickName: nickName, avatarUrl: avatarUrl });
      store.setState('user', { openid: user.openid, nickName: nickName, avatarUrl: avatarUrl });
      wx.redirectTo({ url: '/pages/home/home' });
    }
  },

  // 跳过资料补全
  skipProfile: function () {
    // 本地模式下标记已跳过，避免下次再弹
    if (!cloud.isReady()) {
      wx.setStorageSync('hasProfile', { nickName: '玩家', avatarUrl: '' });
    }
    wx.redirectTo({ url: '/pages/home/home' });
  }
});
