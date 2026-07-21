var store = require('../../utils/store');
var theme = require('../../utils/theme');
var auth = require('../../utils/auth');
var cloud = require('../../utils/cloud');
var timerUtil = require('../../utils/timer');

// 排行榜总用时单位与计时器一致：秒 → 毫秒后用秒表格式展示（MM:SS.d）
function formatTime(seconds) {
  if (!seconds || seconds < 0) return '00:00.0';
  return timerUtil.formatStopwatch(seconds * 1000);
}

Page({
  data: {
    colorMode: 'normal',
    loading: true,
    isLocalMode: false,
    rankings: [],
    myRank: null,
    error: ''
  },

  onLoad: function () {
    var that = this;
    this.unsubTheme = store.subscribe('colorMode', function (m) {
      that.setData({ colorMode: m });
    });
  },

  onShow: function () {
    if (!auth.requireLogin()) return;
    theme.injectTheme(this);
    this.setData({ isLocalMode: !cloud.isReady() });
    if (cloud.isReady()) {
      this.loadRanking();
    } else {
      this.setData({ loading: false });
    }
  },

  onUnload: function () {
    if (this.unsubTheme) this.unsubTheme();
  },

  loadRanking: function () {
    var that = this;
    this.setData({ loading: true, error: '' });
    cloud.getRanking().then(function (res) {
      var list = (res.list || []).map(function (item) {
        return {
          rank: item.rank,
          nickName: item.nickName,
          avatarUrl: item.avatarUrl,
          totalLevels: item.totalLevels,
          totalTimeText: formatTime(item.totalTime),
          isMe: item.isMe
        };
      });
      var myRank = res.myRank;
      if (myRank) {
        myRank.totalTimeText = formatTime(myRank.totalTime);
      }
      that.setData({
        rankings: list,
        myRank: myRank,
        loading: false
      });
    }).catch(function (err) {
      console.error('排行榜加载失败', err);
      that.setData({
        loading: false,
        error: '加载失败，请下拉刷新重试'
      });
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    var that = this;
    if (cloud.isReady()) {
      this.loadRanking();
    }
    setTimeout(function () {
      wx.stopPullDownRefresh();
    }, 1000);
  },

  goHome: function () {
    wx.navigateBack({ delta: 1 });
  },

  // 跳转到开通云开发指引
  showCloudTip: function () {
    wx.showModal({
      title: '需要云开发',
      content: '排行榜需要开通云开发才能查看全部玩家。请参考 README.md 的「模式 B」开通云开发并部署 getRanking 云函数。',
      showCancel: false
    });
  }
});
