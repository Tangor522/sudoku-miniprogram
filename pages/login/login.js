var store = require('../../utils/store');
var theme = require('../../utils/theme');
var cloud = require('../../utils/cloud');
var storage = require('../../utils/storage');

var TARGETS = {
  ranking: '/pages/ranking/ranking',
  pk: '/pages/pk_lobby/pk_lobby',
  game4x4: '/pages/game4x4/game4x4',
  game6x6: '/pages/game6x6/game6x6',
  game9x9: '/pages/game9x9/game9x9'
};

var DESCRIPTIONS = {
  pk: '在线对战需要登录，用于匹配对手和记录战绩',
  ranking: '勇士排行需要登录，用于展示你的成绩和名次',
  game4x4: '你已完成四宫格的 3 关游客体验，登录后继续挑战',
  game6x6: '你已完成六宫格的 3 关游客体验，登录后继续挑战',
  game9x9: '你已完成九宫格的 3 关游客体验，登录后继续挑战',
  home: '登录后可以同步进度和参与在线玩法'
};

Page({
  data: {
    colorMode: 'normal',
    from: 'home',
    loginDesc: DESCRIPTIONS.home,
    logging: false,
    error: '',
    isLocalMode: false
  },

  onLoad: function (options) {
    var that = this;
    var from = options && TARGETS[options.from] ? options.from : 'home';
    this.setData({ from: from, loginDesc: DESCRIPTIONS[from] || DESCRIPTIONS.home });
    this.unsubTheme = store.subscribe('colorMode', function (m) {
      that.setData({ colorMode: m });
    });

    // 已登录用户无需再次操作，直接回到原本想去的功能。
    if (store.getState('user')) this.finishLogin(from);
  },

  onShow: function () {
    theme.injectTheme(this);
    this.setData({ isLocalMode: !cloud.isReady() });
  },

  onUnload: function () {
    if (this.unsubTheme) this.unsubTheme();
  },

  handleLogin: function () {
    var that = this;
    if (this.data.logging) return;
    this.setData({ logging: true, error: '' });

    if (cloud.isReady()) {
      cloud.login().then(function (res) {
        var r = res.result || {};
        if (!r.openid) throw new Error('未获取到用户标识');
        store.setState('user', {
          openid: r.openid,
          nickName: r.nickName || '小勇士',
          avatarUrl: r.avatarUrl || ''
        });
        that.syncCloudProgress().then(function () {
          that.finishLogin(that.data.from);
        });
      }).catch(function (err) {
        console.error('[主动登录] 登录失败', err);
        that.setData({ logging: false, error: '暂时无法登录，请检查网络后重试' });
      });
      return;
    }

    var user = storage.genLocalUser();
    var profile = wx.getStorageSync('hasProfile') || {};
    user.nickName = profile.nickName || '小勇士';
    user.avatarUrl = profile.avatarUrl || '';
    store.setState('user', user);
    this.finishLogin(this.data.from);
  },

  syncCloudProgress: function () {
    var modes = ['4x4', '6x6', '9x9'];
    return Promise.all(modes.map(function (mode) {
      return cloud.getStats(mode).then(function (records) {
        storage.syncLevelFromRecords(mode, records);
      }).catch(function (err) {
        // 单个模式同步失败不阻塞登录，其余模式仍可正常恢复。
        console.warn('[登录进度同步] ' + mode + ' 同步失败', err);
      });
    }));
  },

  finishLogin: function (from) {
    var target = TARGETS[from];
    if (target) {
      wx.redirectTo({ url: target });
      return;
    }
    wx.navigateBack({
      delta: 1,
      fail: function () {
        wx.reLaunch({ url: '/pages/home/home' });
      }
    });
  },

  continueAsGuest: function () {
    if (this.data.from === 'pk') wx.removeStorageSync('pendingPkRoomCode');
    wx.navigateBack({
      delta: 1,
      fail: function () {
        wx.reLaunch({ url: '/pages/home/home' });
      }
    });
  }
});
