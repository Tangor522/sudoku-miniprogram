var store = require('../../utils/store');
var theme = require('../../utils/theme');
var auth = require('../../utils/auth');
var cloud = require('../../utils/cloud');
var storage = require('../../utils/storage');
var timerUtil = require('../../utils/timer');

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function formatCompletedAt(value) {
  var d = new Date(value || Date.now());
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

Page({
  data: {
    colorMode: 'normal',
    gameMode: '4x4',
    records: []
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
    this.loadRecords();
  },

  onUnload: function () {
    if (this.unsubTheme) this.unsubTheme();
  },

  switchMode: function (e) {
    var mode = e.currentTarget.dataset.mode;
    this.setData({ gameMode: mode });
    this.loadRecords();
  },

  // 加载记录（云端优先，失败降级本地）
  loadRecords: function () {
    var that = this;
    var mode = this.data.gameMode;
    if (cloud.isReady()) {
      cloud.getStats(mode).then(function (list) {
        that.setData({ records: that.formatRecords(list) });
      }).catch(function (err) {
        console.error('云端查询失败，降级本地', err);
        that.setData({ records: that.formatRecords(storage.getStats(mode)) });
      });
    } else {
      this.setData({ records: this.formatRecords(storage.getStats(mode)) });
    }
  },

  formatRecords: function (list) {
    return list.map(function (r) {
      var d = new Date(r.completedAt || Date.now());
      return {
        level: r.level,
        usedTime: r.usedTime,
        usedTimeText: timerUtil.formatStopwatch((r.usedTime || 0) * 1000),
        completed: formatCompletedAt(d)
      };
    });
  },

  goGame: function () {
    wx.navigateTo({ url: '/pages/game' + this.data.gameMode + '/game' + this.data.gameMode });
  }
});
