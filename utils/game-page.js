var store = require('./store');
var theme = require('./theme');
var cloud = require('./cloud');
var storage = require('./storage');
var sudoku = require('./sudoku');
var timerUtil = require('./timer');
var auth = require('./auth');

var GUEST_LEVEL_LIMIT = 3;

function cloneCells(grid) {
  return grid.map(function (row) {
    return row.map(function (cell) {
      return { value: cell.value, fixed: cell.fixed, error: !!cell.error };
    });
  });
}

function makeNumbers(size) {
  var numbers = [];
  for (var i = 1; i <= size; i++) numbers.push(i);
  return numbers;
}

function makeNumberRows(size) {
  var numbers = makeNumbers(size);
  if (size === 4) return [numbers.slice(0, 2), numbers.slice(2, 4)];
  if (size === 6) return [numbers.slice(0, 3), numbers.slice(3, 6)];
  return [numbers.slice(0, 3), numbers.slice(3, 6), numbers.slice(6, 9)];
}

function createGamePage(options) {
  var mode = options.mode;
  var cfg = sudoku.MODES[mode];
  return {
    data: {
      colorMode: 'normal', mode: mode, modeTitle: options.title,
      grid: [], gridRows: [], selectedCell: null, solution: [],
      timer: 0, timerText: '00:00.0', timerMain: '00:00', timerTenths: '0', gameStarted: false, isRunning: false,
      showResult: false, resultStatus: null, currentLevel: 1, showCongrats: false,
      numberRows: makeNumberRows(cfg.size),
      sizeClass: 'size-' + cfg.size,
      canUndo: false
    },
    onLoad: function () {
      var that = this;
      var currentLevel = storage.getLevel(mode) || 1;
      if (!store.getState('user') && currentLevel > GUEST_LEVEL_LIMIT) {
        auth.requireLogin('game' + mode);
        return;
      }
      this.unsubTheme = store.subscribe('colorMode', function (m) { that.setData({ colorMode: m }); });
      this.setData({ currentLevel: currentLevel });
      this.timer = timerUtil.createTimer(function (ms) {
        var time = timerUtil.formatStopwatchParts(ms);
        that.setData({ timer: ms, timerText: time.text, timerMain: time.main, timerTenths: time.tenths });
      });
      this.startGame();
    },
    onShow: function () {
      theme.injectTheme(this);
      if (this.data.gameStarted && !this.data.isRunning && !this.data.showResult) {
        this.timer.resume(); this.setData({ isRunning: true });
      }
    },
    onHide: function () { if (this.timer) this.timer.pause(); this.setData({ isRunning: false }); },
    onUnload: function () { if (this.timer) this.timer.stop(); if (this.unsubTheme) this.unsubTheme(); },
    buildRows: function (grid, selected) {
      return grid.map(function (row, r) {
        return row.map(function (cell, c) {
          return {
            value: cell.value, fixed: cell.fixed, error: cell.error, row: r, col: c,
            selected: selected && selected.row === r && selected.col === c,
            borderLeft: c > 0 && c % cfg.boxCols === 0,
            borderTop: r > 0 && r % cfg.boxRows === 0
          };
        });
      });
    },
    startGame: function () {
      var generated = sudoku.generatePuzzle(mode, this.data.currentLevel);
      var grid = sudoku.toCellGrid(generated.puzzle);
      if (this.timer) this.timer.stop();
      this.undoHistory = [];
      this.setData({
        grid: grid, gridRows: this.buildRows(grid, null), solution: generated.solution,
        selectedCell: null, timer: 0, timerText: '00:00.0', timerMain: '00:00', timerTenths: '0', gameStarted: false,
        isRunning: false, showResult: false, resultStatus: null, canUndo: false
      });
    },
    handleStart: function () {
      if (this.data.gameStarted) return;
      this.setData({ gameStarted: true, isRunning: true });
      this.timer.start();
    },
    selectCell: function (e) {
      var selected = { row: Number(e.currentTarget.dataset.row), col: Number(e.currentTarget.dataset.col) };
      if (!this.data.gameStarted || this.data.grid[selected.row][selected.col].fixed) return;
      this.setData({ selectedCell: selected, gridRows: this.buildRows(this.data.grid, selected) });
    },
    setCellValue: function (value) {
      var selected = this.data.selectedCell;
      if (!selected || this.data.grid[selected.row][selected.col].fixed) return;
      var old = this.data.grid[selected.row][selected.col].value;
      if (old === value) return;
      if (!this.undoHistory) this.undoHistory = [];
      // 回退按“最近操作过的不同位置”记录。同一格反复改数只占一个名额，
      // 并始终保留该格第一次修改前的值，回退时一次恢复到原状态。
      var existingIndex = this.undoHistory.findIndex(function (item) {
        return item.row === selected.row && item.col === selected.col;
      });
      var action = existingIndex >= 0
        ? this.undoHistory.splice(existingIndex, 1)[0]
        : { row: selected.row, col: selected.col, value: old };
      this.undoHistory.push(action);
      if (this.undoHistory.length > 3) this.undoHistory.shift();
      var grid = cloneCells(this.data.grid);
      grid[selected.row][selected.col].value = value;
      grid.forEach(function (row) { row.forEach(function (cell) { cell.error = false; }); });
      this.setData({ grid: grid, gridRows: this.buildRows(grid, selected), canUndo: true });
    },
    onNumberClick: function (e) { this.setCellValue(Number(e.currentTarget.dataset.num)); },
    undoLast: function () {
      if (!this.data.gameStarted || !this.undoHistory || !this.undoHistory.length) return;
      var action = this.undoHistory.pop();
      var grid = cloneCells(this.data.grid);
      if (!grid[action.row] || !grid[action.row][action.col] || grid[action.row][action.col].fixed) return;
      grid[action.row][action.col].value = action.value;
      grid.forEach(function (row) { row.forEach(function (cell) { cell.error = false; }); });
      var selected = { row: action.row, col: action.col };
      this.setData({
        grid: grid,
        gridRows: this.buildRows(grid, selected),
        selectedCell: selected,
        canUndo: this.undoHistory.length > 0
      });
    },
    checkAnswer: function () {
      var result = sudoku.checkGrid(this.data.grid, mode);
      if (!result.isComplete) {
        wx.showToast({ title: '请先填写完整', icon: 'none' });
        return;
      }
      var grid = cloneCells(this.data.grid);
      var solution = this.data.solution;
      var hasWrongAnswer = false;
      grid.forEach(function (row, r) {
        row.forEach(function (cell, c) {
          // 严格对照本题唯一正解，只标记玩家真正填错的格子。
          cell.error = !cell.fixed && cell.value !== solution[r][c];
          if (cell.error) hasWrongAnswer = true;
        });
      });
      if (!hasWrongAnswer) {
        this.timer.pause();
        var usedSeconds = Math.floor(this.timer.get() / 1000);
        this.setData({ grid: grid, gridRows: this.buildRows(grid, this.data.selectedCell), isRunning: false, showResult: true, resultStatus: 'success' });
        if (cloud.isReady() && store.getState('user')) cloud.saveProgress(mode, this.data.currentLevel, usedSeconds).catch(function () { storage.saveProgress(mode, this.data.currentLevel, usedSeconds); }.bind(this));
        else storage.saveProgress(mode, this.data.currentLevel, usedSeconds);
      } else {
        // 错误时只在棋盘标出错格，不弹窗、不改变其他格子的颜色。
        this.setData({ grid: grid, gridRows: this.buildRows(grid, this.data.selectedCell), showResult: false, resultStatus: null });
      }
    },
    nextLevel: function () {
      this.setData({ showResult: false });
      if (this.data.currentLevel >= 100) { this.setData({ showCongrats: true }); return; }
      if (!store.getState('user') && this.data.currentLevel >= GUEST_LEVEL_LIMIT) {
        auth.requireLogin('game' + mode);
        return;
      }
      var next = this.data.currentLevel + 1;
      this.setData({ currentLevel: next }); storage.setLevel(mode, next); this.startGame();
      this.setData({ gameStarted: true, isRunning: true });
      this.timer.start();
    },
    closeCongrats: function () { this.setData({ showCongrats: false }); wx.navigateBack({ delta: 1 }); }
  };
}

module.exports = createGamePage;
