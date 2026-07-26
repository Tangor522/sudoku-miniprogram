var pk = require('../../utils/pk');
var store = require('../../utils/store');
var theme = require('../../utils/theme');
var auth = require('../../utils/auth');
var cloud = require('../../utils/cloud');

Page({
  data: {
    colorMode: 'normal',
    mode: '4x4',
    totalRounds: 3,
    matching: false,
    roomCode: '',
    inputRoomCode: '',
    showRoomPanel: false,
    error: '',
    busyAction: '',
    isLocalMode: false
  },

  onLoad: function (options) {
    var that = this;
    this.unsubTheme = store.subscribe('colorMode', function (m) { that.setData({ colorMode: m }); });
    var optionCode = ((options && options.roomCode) || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (optionCode) wx.setStorageSync('pendingPkRoomCode', optionCode);
    var sharedCode = optionCode || wx.getStorageSync('pendingPkRoomCode') || '';
    if (sharedCode) this.setData({ inputRoomCode: sharedCode });
    if (sharedCode && store.getState('user')) wx.removeStorageSync('pendingPkRoomCode');
  },
  onShow: function () {
    if (!auth.requireLogin('pk')) return;
    theme.injectTheme(this);
    this.setData({ isLocalMode: !cloud.isReady() });
  },
  onUnload: function () {
    if (this.unsubTheme) this.unsubTheme();
    if (this.matchPoller) this.matchPoller.close();
    if (this.matchTimer) clearInterval(this.matchTimer);
    // 用户在等待期直接返回时也要清理云端房间；正常进入对局时不取消。
    if (this.waitId && !this.navigatingToGame) pk.cancelMatch(this.waitId);
  },

  setMode: function (e) {
    if (this.data.matching || this.data.busyAction) return;
    this.setData({ mode: e.currentTarget.dataset.mode, error: '' });
  },

  // 局数输入
  onRoundsInput: function (e) {
    if (this.data.matching || this.data.busyAction) return;
    var val = parseInt(e.detail.value) || 1;
    if (val < 1) val = 1;
    if (val > 5) val = 5;
    this.setData({ totalRounds: val });
  },
  roundsMinus: function () {
    if (this.data.matching || this.data.busyAction) return;
    var val = this.data.totalRounds - 1;
    if (val < 1) val = 1;
    this.setData({ totalRounds: val });
  },
  roundsPlus: function () {
    if (this.data.matching || this.data.busyAction) return;
    var val = this.data.totalRounds + 1;
    if (val > 5) val = 5;
    this.setData({ totalRounds: val });
  },

  // 随机匹配
  startRandomMatch: function () {
    if (this.data.matching || this.data.busyAction) return;
    if (this.data.isLocalMode) { this.setData({ error: '在线对战服务暂不可用' }); return; }
    var that = this;
    this.setData({ matching: true, error: '' });
    wx.showLoading({ title: '匹配中...' });
    pk.randomMatch(this.data.mode, this.data.totalRounds).then(function (res) {
      wx.hideLoading();
      if (!res.ok) { that.setData({ matching: false, error: res.error || '匹配失败' }); return; }
      if (res.slot === 1 && res.match) {
        // 直接匹配到了
        that.navigatingToGame = true;
        pk.setActiveMatch(res.matchId, 1, res.match.mode || that.data.mode);
        wx.redirectTo({ url: '/pages/pk_game/pk_game?matchId=' + res.matchId + '&slot=1' });
      } else {
        // 等待匹配
        that.waitId = res.matchId;
        that.waitSlot = 0;
        that.startWaiting(res.matchId);
      }
    }).catch(function (err) {
      wx.hideLoading();
      that.setData({ matching: false, error: '网络异常，请重试' });
    });
  },

  // 等待匹配（轮询替代 watch）
  startWaiting: function (matchId) {
    var that = this;
    if (this.matchPoller) this.matchPoller.close();
    if (this.matchTimer) clearInterval(this.matchTimer);
    this.matchPoller = pk.pollMatch(matchId, function (doc) {
      if (doc.status === 'playing') {
        that.matchPoller.close();
        that.matchPoller = null;
        if (that.matchTimer) { clearInterval(that.matchTimer); that.matchTimer = null; }
        that.navigatingToGame = true;
        pk.setActiveMatch(matchId, 0, doc.mode || that.data.mode);
        wx.redirectTo({ url: '/pages/pk_game/pk_game?matchId=' + matchId + '&slot=0' });
      } else if (doc.status === 'cancelled') {
        that.waitId = null;
        that.setData({ matching: false, error: '匹配已取消' });
      }
    }, function (err) {
      console.error('poll error', err);
    });

    // 30秒超时
    var countdown = 30;
    this.matchTimer = setInterval(function () {
      countdown--;
      if (countdown <= 0) {
        clearInterval(that.matchTimer);
        that.matchTimer = null;
        if (that.matchPoller) { that.matchPoller.close(); that.matchPoller = null; }
        pk.cancelMatch(matchId);
        that.waitId = null;
        that.setData({ matching: false, error: '匹配超时，请重试' });
      }
    }, 1000);
  },

  cancelMatching: function () {
    if (this.waitId) pk.cancelMatch(this.waitId);
    this.waitId = null;
    if (this.matchPoller) { this.matchPoller.close(); this.matchPoller = null; }
    if (this.matchTimer) { clearInterval(this.matchTimer); this.matchTimer = null; }
    this.setData({ matching: false });
  },

  // 创建房间
  createRoom: function () {
    if (this.data.busyAction || this.data.matching) return;
    if (this.data.isLocalMode) { this.setData({ error: '在线对战服务暂不可用' }); return; }
    var that = this;
    this.setData({ error: '', busyAction: 'create' });
    wx.showLoading({ title: '创建房间...' });
    pk.createRoom(this.data.mode, this.data.totalRounds).then(function (res) {
      wx.hideLoading();
      if (!res.ok) { that.setData({ error: res.error || '创建失败', busyAction: '' }); return; }
      that.setData({ roomCode: res.roomCode, showRoomPanel: true, busyAction: '' });
      that.waitId = res.matchId;
      that.waitSlot = 0;
      that.startWaiting(res.matchId);
    }).catch(function () {
      wx.hideLoading();
      that.setData({ error: '创建失败', busyAction: '' });
    });
  },

  // 加入房间
  joinRoom: function () {
    if (this.data.busyAction || this.data.matching) return;
    if (this.data.isLocalMode) { this.setData({ error: '在线对战服务暂不可用' }); return; }
    var that = this;
    var code = (this.data.inputRoomCode || '').trim().toUpperCase();
    if (code.length !== 6) { this.setData({ error: '请输入6位房间号' }); return; }
    this.setData({ error: '', busyAction: 'join' });
    wx.showLoading({ title: '加入中...' });
    pk.joinRoom(code).then(function (res) {
      wx.hideLoading();
      if (!res.ok) { that.setData({ error: res.error || '加入失败', busyAction: '' }); return; }
      that.navigatingToGame = true;
      that.setData({ busyAction: '' });
      pk.setActiveMatch(res.matchId, 1, (res.match && res.match.mode) || that.data.mode);
      wx.redirectTo({ url: '/pages/pk_game/pk_game?matchId=' + res.matchId + '&slot=1' });
    }).catch(function () {
      wx.hideLoading();
      that.setData({ error: '加入失败', busyAction: '' });
    });
  },

  onRoomInput: function (e) {
    this.setData({ inputRoomCode: (e.detail.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6), error: '' });
  },

  closeRoomPanel: function () {
    this.setData({ showRoomPanel: false });
    this.cancelMatching();
  },

  // 分享房间号
  onShareAppMessage: function () {
    return {
      title: '数独PK！房间号 ' + this.data.roomCode + '，快来挑战我！',
      path: '/pages/pk_lobby/pk_lobby?roomCode=' + this.data.roomCode
    };
  }
});
