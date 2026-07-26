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

function formatTimeParts(seconds) {
  return timerUtil.formatStopwatchParts((seconds && seconds > 0 ? seconds : 0) * 1000);
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
    if (!auth.requireLogin('ranking')) return;
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
    var requestId = (this.rankingRequestId || 0) + 1;
    this.rankingRequestId = requestId;
    this.setData({ loading: true, error: '' });
    return cloud.getRanking().then(function (res) {
      if (that.rankingRequestId !== requestId) return;
      var list = (res.list || []).map(function (item) {
        var time = formatTimeParts(item.totalTime);
        return {
          rank: item.rank,
          nickName: item.nickName,
          avatarUrl: item.avatarUrl,
          totalLevels: item.totalLevels,
          totalTimeText: formatTime(item.totalTime),
          totalTimeMain: time.main,
          totalTimeTenths: time.tenths,
          isMe: item.isMe
        };
      });
      var myRank = res.myRank;
      if (myRank) {
        var myTime = formatTimeParts(myRank.totalTime);
        myRank.totalTimeText = formatTime(myRank.totalTime);
        myRank.totalTimeMain = myTime.main;
        myRank.totalTimeTenths = myTime.tenths;
      }
      that.setData({
        rankings: list,
        myRank: myRank,
        loading: false
      });
    }).catch(function (err) {
      console.error('排行榜加载失败', err);
      if (that.rankingRequestId !== requestId) return;
      that.setData({
        loading: false,
        error: '加载失败，请下拉刷新重试'
      });
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    if (cloud.isReady()) {
      this.loadRanking().then(function () {
        wx.stopPullDownRefresh();
      }, function () {
        wx.stopPullDownRefresh();
      });
      return;
    }
    wx.stopPullDownRefresh();
  },

  // 说明在线排行状态
  showCloudTip: function () {
    wx.showModal({
      title: '排行榜暂不可用',
      content: '当前处于本地模式，连接在线服务后即可查看全部玩家排名。',
      showCancel: false
    });
  }
});
