var store = require('./store');
var theme = require('./theme');
var auth = require('./auth');
var cloud = require('./cloud');
var storage = require('./storage');
var sudoku = require('./sudoku');
var timerUtil = require('./timer');

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
      grid: [], gridRows: [], selectedCell: null, solution: [], initialGrid: [],
      timer: 0, timerText: '00:00.0', gameStarted: false, isRunning: false,
      showResult: false, resultStatus: null, currentLevel: 1, showCongrats: false,
      numberRows: makeNumberRows(cfg.size),
      sizeClass: 'size-' + cfg.size
    },
    onLoad: function () {
      var that = this;
      this.unsubTheme = store.subscribe('colorMode', function (m) { that.setData({ colorMode: m }); });
      this.setData({ currentLevel: storage.getLevel(mode) || 1 });
      this.timer = timerUtil.createTimer(function (ms) {
        that.setData({ timer: ms, timerText: timerUtil.formatStopwatch(ms) });
      });
      this.startGame();
    },
    onShow: function () {
      if (!auth.requireLogin()) return;
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
      this.setData({
        grid: grid, gridRows: this.buildRows(grid, null), initialGrid: cloneCells(grid), solution: generated.solution,
        selectedCell: null, timer: 0, timerText: '00:00.0', gameStarted: false,
        isRunning: false, showResult: false, resultStatus: null
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
      var grid = cloneCells(this.data.grid);
      grid[selected.row][selected.col].value = value;
      grid.forEach(function (row) { row.forEach(function (cell) { cell.error = false; }); });
      this.setData({ grid: grid, gridRows: this.buildRows(grid, selected) });
    },
    onNumberClick: function (e) { this.setCellValue(Number(e.currentTarget.dataset.num)); },
    checkAnswer: function () {
      var result = sudoku.checkGrid(this.data.grid, mode);
      var grid = cloneCells(this.data.grid);
      grid.forEach(function (row, r) { row.forEach(function (cell, c) { cell.error = !!result.errorCells[r + '-' + c]; }); });
      if (result.isComplete && !result.hasError) {
        this.timer.pause();
        var usedSeconds = Math.floor(this.timer.get() / 1000);
        this.setData({ grid: grid, gridRows: this.buildRows(grid, this.data.selectedCell), isRunning: false, showResult: true, resultStatus: 'success' });
        if (cloud.isReady()) cloud.saveProgress(mode, this.data.currentLevel, usedSeconds).catch(function () { storage.saveProgress(mode, this.data.currentLevel, usedSeconds); }.bind(this));
        else storage.saveProgress(mode, this.data.currentLevel, usedSeconds);
      } else {
        this.setData({ grid: grid, gridRows: this.buildRows(grid, this.data.selectedCell), showResult: true, resultStatus: 'error' });
      }
    },
    nextLevel: function () {
      this.setData({ showResult: false });
      if (this.data.currentLevel >= 100) { this.setData({ showCongrats: true }); return; }
      var next = this.data.currentLevel + 1;
      this.setData({ currentLevel: next }); storage.setLevel(mode, next); this.startGame();
      this.setData({ gameStarted: true, isRunning: true });
      this.timer.start();
    },
    resetGame: function () {
      var grid = cloneCells(this.data.initialGrid);
      this.timer.stop();
      this.setData({ grid: grid, gridRows: this.buildRows(grid, null), selectedCell: null, timer: 0, timerText: '00:00.0', showResult: false, gameStarted: true, isRunning: true });
      this.timer.start();
    },
    closeResult: function () { this.setData({ showResult: false }); if (!this.data.isRunning) { this.timer.resume(); this.setData({ isRunning: true }); } },
    closeCongrats: function () { this.setData({ showCongrats: false }); wx.navigateBack({ delta: 1 }); },
    goHome: function () { this.timer.stop(); wx.navigateBack({ delta: 1 }); }
  };
}

module.exports = createGamePage;
