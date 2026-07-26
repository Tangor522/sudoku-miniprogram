var store = require('../../utils/store');
var theme = require('../../utils/theme');
var auth = require('../../utils/auth');
var pk = require('../../utils/pk');
var sudoku = require('../../utils/sudoku');
var timerUtil = require('../../utils/timer');

var MODE = '';

Page({
  data: {
    colorMode: 'normal',
    matchId: '',
    mySlot: 0,
    oppSlot: 1,
    mode: '',
    totalRounds: 1,
    myCurrentRound: 1,
    // 准备阶段
    gamePhase: 'readying',  // 'readying' | 'playing' | 'finished'
    myReady: false,
    oppReady: false,

    // 我的棋盘
    grid: [],
    gridRows: [],
    solution: [],
    selectedCell: null,
    timer: 0,
    timerText: '00:00.0',

    // 对手进度（不显示棋盘，只显示进度条）
    oppCurrentRound: 1,
    oppProgressPercent: 0,

    // 成绩
    myTotalTime: 0,
    oppTotalTime: 0,
    myTotalTimeText: '00:00.0',
    oppTotalTimeText: '00:00.0',

    // 弹窗
    showFinal: false,
    finalInfo: null,

    // 掉线
    oppOffline: false,
    reconnectCountdown: 0,

    // 状态
    loading: true,
    loadError: '',
    submitting: false,
    preparing: false,
    myInfo: {},
    oppInfo: {},
    numberRows: [],
    canUndo: false
  },

  onLoad: function (options) {
    var that = this;
    this.matchId = options.matchId;
    this.mySlot = parseInt(options.slot);
    this.oppSlot = this.mySlot === 0 ? 1 : 0;

    this.unsubTheme = store.subscribe('colorMode', function (m) { that.setData({ colorMode: m }); });
    this.timer = timerUtil.createTimer(function (ms) {
      that.setData({ timer: ms, timerText: timerUtil.formatStopwatch(ms) });
    });
    this.heartbeatTimer = null;
    this.pollErrorRetry = 0;

    this.initMatch();
  },

  onShow: function () {
    if (!auth.requireLogin()) return;
    theme.injectTheme(this);
    if (!this.poller && this.matchId) { this.startPolling(); }
    if (this.matchId && !this.data.loading) {
      this.reloadData();
      this.startHeartbeat();
    }
  },

  onHide: function () {
    // PK 用时由云端开始时间决定；回到前台时会重新校准，不会少算后台时间。
    if (this.matchId && this.data.gamePhase === 'playing' && this.data.grid.length) {
      var numGrid = this.data.grid.map(function (r) { return r.map(function (c) { return c.value; }); });
      // 退到后台前强制保存，避免最后一次输入或退回被 2 秒节流遗漏。
      pk.forceSync(this.matchId, this.mySlot, numGrid, this.data.myCurrentRound);
    }
    this.timer.pause();
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.reconnectTimer) { clearInterval(this.reconnectTimer); this.reconnectTimer = null; }
  },

  onUnload: function () {
    this.timer.stop();
    if (this.poller) { this.poller.close(); this.poller = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.unsubTheme) this.unsubTheme();
    // 页面卸载可能由系统回收、跳转或异常中断触发，不能据此判定玩家主动认输。
    // 但准备阶段尚未形成有效比赛，可安全取消，避免把对手留在失效房间。
    if (this.matchId && this.data.gamePhase === 'readying' && !this.data.loading && !this.data.loadError) {
      pk.leaveBeforeStart(this.matchId);
      pk.clearActiveMatch();
    }
  },

  initMatch: function () {
    var that = this;
    this.setData({ loading: true, loadError: '' });
    pk.reconnect(this.matchId).then(function (res) {
      if (!res.ok) { that.setData({ loading: false, loadError: res.error || '对局已结束或不存在' }); return; }
      var match = res.match;
      MODE = match.mode;
      that.applyMatchData(match);
      if (that.data.loadError) return;
      that.setData({ loading: false });
      that.startPolling();
      that.startHeartbeat();
    }).catch(function (err) {
      console.error('initMatch error', err);
      that.setData({ loading: false, loadError: '对局加载失败，请检查网络后重试' });
    });
  },

  applyMatchData: function (match) {
    var myState = match.playerStates['' + this.mySlot] || {};
    var oppState = match.playerStates['' + this.oppSlot] || {};
    var myRound = myState.currentRound || 1;
    var oppRound = oppState.currentRound || 1;

    // 我的当前局题目
    var myRoundIdx = myRound - 1;
    if (!match.rounds || !match.rounds[myRoundIdx]) {
      // 数据异常保护，避免越界崩溃
      console.error('applyMatchData: rounds 数据异常', myRound, match.rounds);
      this.setData({ loading: false, loadError: '对局数据异常，请返回后重新匹配' });
      return;
    }
    var puzzle = match.rounds[myRoundIdx].puzzle;
    var solution = match.rounds[myRoundIdx].solution || sudoku.solvePuzzle(puzzle, match.mode);
    if (!solution) {
      this.setData({ loading: false, loadError: '本局答案数据异常，请返回后重新匹配' });
      return;
    }
    var size = puzzle.length;
    var numbers = [];
    for (var n = 1; n <= size; n++) numbers.push(n);
    // 与单人模式一致：4×4 为 2×2，6×6 为 2×3，9×9 为 3×3。
    var columns = size === 4 ? 2 : 3;
    var numberRows = [];
    for (var ni = 0; ni < numbers.length; ni += columns) numberRows.push(numbers.slice(ni, ni + columns));

    // 我的棋盘：从 progress 恢复或用 puzzle 初始化
    var myGrid;
    var progKey = '' + this.mySlot;
    if (match.progress && match.progress[progKey] && match.progress[progKey].grid) {
      myGrid = sudoku.toCellGrid(match.progress[progKey].grid);
    } else {
      myGrid = sudoku.toCellGrid(puzzle);
    }

    var myInfo = match.players[this.mySlot] || {};
    var oppInfo = match.players[this.oppSlot] || {};

    // 对手进度百分比
    var oppProgressPercent = Math.min(100, Math.round((oppRound - 1) / match.totalRounds * 100));

    // 准备状态
    var myReady = !!myState.ready;
    var oppReady = !!oppState.ready;
    var bothReady = myReady && oppReady;
    var phase = bothReady ? 'playing' : 'readying';

    if (this.undoRound !== myRound) {
      this.undoRound = myRound;
      this.undoHistory = [];
    }

    this.setData({
      matchId: match._id,
      mySlot: this.mySlot, oppSlot: this.oppSlot,
      mode: match.mode, totalRounds: match.totalRounds,
      myCurrentRound: myRound, oppCurrentRound: oppRound,
      oppProgressPercent: oppProgressPercent,
      myReady: myReady, oppReady: oppReady,
      gamePhase: phase,
      grid: myGrid,
      gridRows: this.buildRows(myGrid, null, match.mode),
      solution: solution,
      myTotalTime: myState.totalTime || 0,
      oppTotalTime: oppState.totalTime || 0,
      myTotalTimeText: timerUtil.formatStopwatch(myState.totalTime || 0),
      oppTotalTimeText: timerUtil.formatStopwatch(oppState.totalTime || 0),
      myInfo: myInfo, oppInfo: oppInfo,
      numberRows: numberRows,
      canUndo: !!(this.undoHistory && this.undoHistory.length)
    });
    this.syncRoundTimer(myState, phase === 'playing');
  },

  syncRoundTimer: function (myState, shouldRun) {
    this.timer.stop();
    if (!shouldRun || !myState || myState.finished) {
      this.setData({ timer: 0, timerText: '00:00.0' });
      return;
    }
    var roundIdx = Math.max(0, (myState.currentRound || 1) - 1);
    var startedAt = (myState.roundStartTimes || [])[roundIdx];
    var elapsed = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
    this.timer.start(elapsed);
  },

  buildRows: function (grid, sel, mode) {
    return grid.map(function (row, r) {
      return row.map(function (cell, c) {
        var borderLeft = mode === '4x4' ? c === 2 : (mode === '6x6' ? c === 3 : (c === 3 || c === 6));
        var borderTop = mode === '4x4' ? r === 2 : (mode === '6x6' ? (r === 2 || r === 4) : (r === 3 || r === 6));
        return {
          value: cell.value, fixed: cell.fixed, error: cell.error,
          row: r, col: c,
          selected: sel && sel.row === r && sel.col === c,
          borderLeft: borderLeft, borderTop: borderTop
        };
      });
    });
  },

  startPolling: function () {
    var that = this;
    if (this.poller) { this.poller.close(); this.poller = null; }
    this.poller = pk.pollMatch(this.matchId, function (match) {
      that.onMatchUpdate(match);
    }, function (err) {
      console.error('poll error', err);
    });
  },

  onMatchUpdate: function (doc) {
    var that = this;

    if (doc.status === 'cancelled') {
      if (this.poller) { this.poller.close(); this.poller = null; }
      pk.clearActiveMatch();
      this.matchId = null;
      wx.showToast({ title: '对手已退出对战', icon: 'none' });
      setTimeout(function () { wx.navigateBack({ delta: 1 }); }, 800);
      return;
    }

    // 整场结束
    if (doc.status === 'finished') {
      this.timer.stop();
      if (this.poller) { this.poller.close(); this.poller = null; }
      if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
      if (this.reconnectTimer) { clearInterval(this.reconnectTimer); this.reconnectTimer = null; }
      pk.clearActiveMatch();
      var winner = doc.winnerSlot;
      var myResult = winner === this.mySlot ? '胜利' : (winner === -1 ? '平局' : '失败');
      var myState = doc.playerStates['' + this.mySlot] || {};
      var oppState = doc.playerStates['' + this.oppSlot] || {};
      var roundsDetail = [];
      for (var i = 0; i < doc.rounds.length; i++) {
        var myT = (myState.roundTimes || [])[i];
        var oppT = (oppState.roundTimes || [])[i];
        roundsDetail.push({
          round: i + 1,
          myTime: myT,
          oppTime: oppT,
          myTimeText: myT != null ? timerUtil.formatStopwatch(myT) : '未完成',
          oppTimeText: oppT != null ? timerUtil.formatStopwatch(oppT) : '未完成'
        });
      }
      this.setData({
        gamePhase: 'finished',
        oppOffline: false,
        showFinal: true,
        finalInfo: {
          result: myResult,
          roundsDetail: roundsDetail,
          myTotal: myState.totalTime || 0,
          oppTotal: oppState.totalTime || 0,
          myTotalText: (myState.roundTimes || []).length ? timerUtil.formatStopwatch(myState.totalTime || 0) : '未完成',
          oppTotalText: (oppState.roundTimes || []).length ? timerUtil.formatStopwatch(oppState.totalTime || 0) : '未完成',
          myRounds: myState.currentRound || 0,
          oppRounds: oppState.currentRound || 0
        }
      });
      return;
    }

    // 对方进度更新
    var oppProgKey = '' + this.oppSlot;
    var oppState = doc.playerStates['' + this.oppSlot] || {};
    var oppRound = oppState.currentRound || 1;
    var myState2 = doc.playerStates['' + this.mySlot] || {};

    // 准备状态检测：双方都ready后进入playing
    var myReady = !!myState2.ready;
    var oppReady = !!oppState.ready;
    if (myReady && oppReady && this.data.gamePhase === 'readying') {
      // 双方都已准备，开始游戏
      this.setData({ gamePhase: 'playing', myReady: true, oppReady: true });
      this.syncRoundTimer(myState2, true);
    } else {
      this.setData({ myReady: myReady, oppReady: oppReady });
    }

    // 只更新对手的进度条和用时，不显示棋盘
    var oppPercent = Math.min(100, Math.round((oppRound - 1) / doc.totalRounds * 100));
    this.setData({
      oppCurrentRound: oppRound,
      oppProgressPercent: oppPercent,
      oppTotalTime: oppState.totalTime || 0,
      oppTotalTimeText: timerUtil.formatStopwatch(oppState.totalTime || 0)
    });

    // 更新我的累计用时
    this.setData({
      myTotalTime: myState2.totalTime || 0,
      myTotalTimeText: timerUtil.formatStopwatch(myState2.totalTime || 0)
    });

    // 对方掉线
    var oppDisc = doc.disconnect && doc.disconnect['' + this.oppSlot];
    if (oppDisc && oppDisc.offline) {
      if (!this.data.oppOffline) {
        this.setData({ oppOffline: true, reconnectCountdown: 30 });
        this.startReconnectCountdown();
      }
    } else {
      if (this.data.oppOffline) {
        this.setData({ oppOffline: false, reconnectCountdown: 0 });
        if (this.reconnectTimer) { clearInterval(this.reconnectTimer); this.reconnectTimer = null; }
      }
    }
  },

  startHeartbeat: function () {
    var that = this;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(function () {
      pk.heartbeat(that.matchId, that.mySlot);
    }, 10000);
  },

  startReconnectCountdown: function () {
    var that = this;
    if (this.reconnectTimer) clearInterval(this.reconnectTimer);
    this.reconnectTimer = setInterval(function () {
      var cd = that.data.reconnectCountdown - 1;
      if (cd <= 0) {
        clearInterval(that.reconnectTimer);
        that.reconnectTimer = null;
        pk.timeoutLoss(that.matchId);
      } else {
        that.setData({ reconnectCountdown: cd });
      }
    }, 1000);
  },

  // 点准备开始
  handleReady: function () {
    if (this.data.myReady || this.data.preparing) return;
    var that = this;
    this.setData({ preparing: true });
    pk.setReady(this.matchId).then(function (res) {
      that.setData({ preparing: false });
      if (res.ok) {
        that.setData({ myReady: true, oppReady: res.oppReady });
        if (res.bothReady && that.data.gamePhase === 'readying') {
          that.setData({ gamePhase: 'playing' });
          // setReady 后再拉一次云端开始时间，避免双方本地起跑时刻不一致。
          that.reloadData();
        }
      } else {
        wx.showToast({ title: res.error || '准备失败', icon: 'none' });
      }
    }).catch(function (err) {
      that.setData({ preparing: false });
      console.error('setReady error', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
    });
  },

  selectCell: function (e) {
    var row = e.currentTarget.dataset.row;
    var col = e.currentTarget.dataset.col;
    if (this.data.grid[row][col].fixed) return;
    var sel = { row: row, col: col };
    this.setData({
      selectedCell: sel,
      gridRows: this.buildRows(this.data.grid, sel, this.data.mode)
    });
  },

  onNumberClick: function (e) {
    var num = Number(e.currentTarget.dataset.num);
    var sel = this.data.selectedCell;
    if (!sel) return;
    if (this.data.grid[sel.row][sel.col].fixed) return;
    var old = this.data.grid[sel.row][sel.col].value;
    if (old === num) return;
    if (!this.undoHistory) this.undoHistory = [];
    // 与单人模式一致：最多回退最近操作过的 3 个不同位置。
    // 同一位置多次改数只保留第一次修改前的值，并更新其最近操作顺序。
    var existingIndex = this.undoHistory.findIndex(function (item) {
      return item.row === sel.row && item.col === sel.col;
    });
    var action = existingIndex >= 0
      ? this.undoHistory.splice(existingIndex, 1)[0]
      : { row: sel.row, col: sel.col, value: old };
    this.undoHistory.push(action);
    if (this.undoHistory.length > 3) this.undoHistory.shift();
    var grid = this.data.grid.map(function (row) {
      return row.map(function (cell) { return { value: cell.value, fixed: cell.fixed, error: false }; });
    });
    grid[sel.row][sel.col].value = num;
    this.setData({
      grid: grid,
      gridRows: this.buildRows(grid, sel, this.data.mode),
      canUndo: true
    });
    var numGrid = grid.map(function (r) { return r.map(function (c) { return c.value; }); });
    pk.syncProgress(this.matchId, this.mySlot, numGrid, this.data.myCurrentRound);
  },

  undoLast: function () {
    if (this.data.gamePhase !== 'playing' || !this.undoHistory || !this.undoHistory.length) return;
    var action = this.undoHistory.pop();
    var grid = this.data.grid.map(function (row) {
      return row.map(function (cell) { return { value: cell.value, fixed: cell.fixed, error: false }; });
    });
    if (!grid[action.row] || !grid[action.row][action.col] || grid[action.row][action.col].fixed) return;
    grid[action.row][action.col].value = action.value;
    var selected = { row: action.row, col: action.col };
    this.setData({
      grid: grid,
      gridRows: this.buildRows(grid, selected, this.data.mode),
      selectedCell: selected,
      canUndo: this.undoHistory.length > 0
    });
    var numGrid = grid.map(function (r) { return r.map(function (c) { return c.value; }); });
    pk.forceSync(this.matchId, this.mySlot, numGrid, this.data.myCurrentRound);
  },

  submitAnswer: function () {
    if (this.data.submitting) return;
    var that = this;
    var checkers = { '4x4': sudoku.check4x4, '6x6': sudoku.check6x6, '9x9': sudoku.check9x9 };
    var checker = checkers[this.data.mode];
    var result = checker(this.data.grid);
    if (!result.isComplete) { wx.showToast({ title: '请先填写完整', icon: 'none' }); return; }
    var solution = this.data.solution;
    var hasWrongAnswer = false;
    var errorGrid = this.data.grid.map(function (row, r) {
      return row.map(function (cell, c) {
        var isWrong = !cell.fixed && cell.value !== solution[r][c];
        if (isWrong) hasWrongAnswer = true;
        return { value: cell.value, fixed: cell.fixed, error: isWrong };
      });
    });
    if (hasWrongAnswer) {
      this.setData({
        grid: errorGrid,
        gridRows: this.buildRows(errorGrid, this.data.selectedCell, this.data.mode)
      });
      return;
    }

    var numGrid = this.data.grid.map(function (r) { return r.map(function (c) { return c.value; }); });
    this.setData({ submitting: true });
    pk.forceSync(this.matchId, this.mySlot, numGrid, this.data.myCurrentRound).then(function () {
      return pk.submitRound(that.matchId, numGrid);
    }).then(function (res) {
      that.setData({ submitting: false });
      if (!res.ok) {
        if (res.reason === 'wrong') { wx.showToast({ title: '答案不正确', icon: 'none' }); }
        else { wx.showToast({ title: res.error || '提交失败', icon: 'none' }); }
        return;
      }

      that.setData({
        myTotalTime: res.myTotalTime,
        myTotalTimeText: timerUtil.formatStopwatch(res.myTotalTime || 0)
      });

      if (res.matchFinished) {
        // 整场结束，等 watch 推送结算
      } else if (res.nextRound) {
        // 进入下一局，重新加载棋盘
        that.reloadData();
      }
    }).catch(function (err) {
      that.setData({ submitting: false });
      console.error('submit error', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
    });
  },

  // 重新从云端拉取最新 match 数据，刷新棋盘
  reloadData: function () {
    var that = this;
    pk.reconnect(this.matchId).then(function (res) {
      if (res.ok) { that.applyMatchData(res.match); }
    }).catch(function (err) {
      console.error('reload match error', err);
      wx.showToast({ title: '同步对局失败', icon: 'none' });
    });
  },

  retryLoad: function () { this.initMatch(); },

  leaveBrokenMatch: function () {
    pk.clearActiveMatch();
    this.matchId = null;
    wx.navigateBack({ delta: 1, fail: function () { wx.reLaunch({ url: '/pages/pk_lobby/pk_lobby' }); } });
  },

  goHome: function () {
    if (this.poller) { this.poller.close(); this.poller = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    pk.clearActiveMatch();
    this.matchId = null;
    wx.navigateBack({ delta: 2, fail: function () { wx.reLaunch({ url: '/pages/home/home' }); } });
  },

  exitBattle: function () {
    var that = this;
    var isPlaying = this.data.gamePhase === 'playing';
    wx.showModal({
      title: '确认',
      content: isPlaying ? '确定认输吗？本局将判对手获胜。' : '确定退出对战吗？退出不会计入战绩。',
      success: function (res) {
        if (res.confirm) {
          var request = isPlaying ? pk.surrender(that.matchId) : pk.leaveBeforeStart(that.matchId);
          request.then(function (result) {
            if (!result || !result.ok) {
              wx.showToast({ title: (result && result.error) || '退出失败', icon: 'none' });
              return;
            }
            pk.clearActiveMatch();
            that.matchId = null;
            wx.navigateBack({ delta: 1 });
          }).catch(function (err) {
            console.error('exit battle error', err);
            wx.showToast({ title: '退出失败，请重试', icon: 'none' });
          });
        }
      }
    });
  }
});
