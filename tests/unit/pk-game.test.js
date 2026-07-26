// PK 页面控制层回归：云端计时校准、九宫格键盘和结算文案。

function deferred() {
  var resolve;
  var promise = new Promise(function (res) { resolve = res; });
  return { promise: promise, resolve: resolve };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('PK 页面核心行为', function () {
  var definition;
  var timer;
  var pkMock;

  function zeroGrid(size) {
    return Array.from({ length: size }, function () { return Array(size).fill(0); });
  }

  function makeMatch(overrides) {
    var puzzle = zeroGrid(9);
    var base = {
      _id: 'pk-1', status: 'playing', mode: '9x9', totalRounds: 3,
      players: [{ openid: 'me', nickName: 'A' }, { openid: 'opp', nickName: 'B' }],
      rounds: [{ puzzle: puzzle }, { puzzle: puzzle }, { puzzle: puzzle }],
      playerStates: {
        '0': { ready: true, currentRound: 3, roundStartTimes: [1000, 2000, 87500], roundTimes: [10000, 12000], totalTime: 22000, finished: false },
        '1': { ready: true, currentRound: 1, roundStartTimes: [1000], roundTimes: [], totalTime: 0, finished: false }
      },
      progress: {}, disconnect: {}
    };
    return Object.assign(base, overrides || {});
  }

  function makePage() {
    var page = {};
    Object.keys(definition).forEach(function (key) { page[key] = definition[key]; });
    page.data = JSON.parse(JSON.stringify(definition.data));
    page.setData = function (patch) { Object.assign(page.data, patch); };
    page.mySlot = 0;
    page.oppSlot = 1;
    page.matchId = 'pk-1';
    page.timer = timer;
    return page;
  }

  beforeEach(function () {
    jest.resetModules();
    jest.spyOn(Date, 'now').mockReturnValue(100000);
    timer = { start: jest.fn(), stop: jest.fn(), pause: jest.fn(), resume: jest.fn() };
    global.wx = {
      showToast: jest.fn(), showLoading: jest.fn(), hideLoading: jest.fn(),
      navigateBack: jest.fn(), showModal: jest.fn(), setStorageSync: jest.fn(),
      getStorageSync: jest.fn(), removeStorageSync: jest.fn(), cloud: { callFunction: jest.fn() }
    };
    global.Page = function (value) { definition = value; };
    jest.doMock('../../utils/store', function () { return { subscribe: jest.fn(), getState: jest.fn() }; });
    jest.doMock('../../utils/theme', function () { return { injectTheme: jest.fn() }; });
    jest.doMock('../../utils/auth', function () { return { requireLogin: jest.fn(function () { return true; }) }; });
    pkMock = { clearActiveMatch: jest.fn(), syncProgress: jest.fn(), forceSync: jest.fn(function () { return Promise.resolve({ ok: true }); }), submitRound: jest.fn() };
    jest.doMock('../../utils/pk', function () { return pkMock; });
    jest.doMock('../../utils/timer', function () {
      return {
        createTimer: jest.fn(function () { return timer; }),
        formatStopwatch: function (ms) {
          var sec = Math.floor((ms || 0) / 1000);
          return '00:' + (sec < 10 ? '0' : '') + sec + '.0';
        }
      };
    });
    jest.doMock('../../utils/sudoku', function () {
      return {
        solvePuzzle: function (puzzle) { return puzzle; },
        check9x9: function () { return { isComplete: true, hasError: false }; },
        toCellGrid: function (puzzle) {
          return puzzle.map(function (row) { return row.map(function (v) { return { value: v, fixed: v !== 0, error: false }; }); });
        }
      };
    });
    require('../../pages/pk_game/pk_game.js');
  });

  afterEach(function () {
    Date.now.mockRestore();
    delete global.Page;
    delete global.wx;
  });

  test('9x9 键盘为 3×3，重进第三局从云端已过时间继续', function () {
    var page = makePage();
    page.applyMatchData(makeMatch());
    expect(page.data.numberRows).toEqual([[1,2,3], [4,5,6], [7,8,9]]);
    expect(page.data.myCurrentRound).toBe(3);
    expect(timer.stop).toHaveBeenCalled();
    expect(timer.start).toHaveBeenCalledWith(12500);
  });

  test('结算保留赢家最后一局时间，未完成的对手不显示假零分', function () {
    var page = makePage();
    page.poller = { close: jest.fn() };
    page.heartbeatTimer = 1;
    page.reconnectTimer = 2;
    var match = makeMatch({ status: 'finished', winnerSlot: 0 });
    match.playerStates['0'] = { currentRound: 3, roundTimes: [10000, 12000, 15000], totalTime: 37000, finished: true };
    page.onMatchUpdate(match);
    expect(page.data.finalInfo.myTotalText).toBe('00:37.0');
    expect(page.data.finalInfo.roundsDetail[2].myTimeText).toBe('00:15.0');
    expect(page.data.finalInfo.oppTotalText).toBe('未完成');
    expect(page.data.finalInfo.roundsDetail[0].oppTimeText).toBe('未完成');
    expect(page.data.gamePhase).toBe('finished');
    expect(page.poller).toBeNull();
    expect(page.heartbeatTimer).toBeNull();
    expect(page.reconnectTimer).toBeNull();
  });

  test('页面回到前台时重新拉取云端时间并恢复心跳', function () {
    var page = makePage();
    page.matchId = 'pk-1';
    page.data.loading = false;
    page.startPolling = jest.fn();
    page.reloadData = jest.fn();
    page.startHeartbeat = jest.fn();
    page.onShow();
    expect(page.startPolling).toHaveBeenCalled();
    expect(page.reloadData).toHaveBeenCalled();
    expect(page.startHeartbeat).toHaveBeenCalled();
  });

  test('PK 也只回退最近 3 个不同位置，并把回退后的棋盘同步到云端', function () {
    var page = makePage();
    page.applyMatchData(makeMatch());
    page.data.selectedCell = { row: 0, col: 0 };
    page.onNumberClick({ currentTarget: { dataset: { num: 1 } } });
    page.onNumberClick({ currentTarget: { dataset: { num: 2 } } });
    expect(page.undoHistory).toHaveLength(1);
    page.data.selectedCell = { row: 0, col: 1 };
    page.onNumberClick({ currentTarget: { dataset: { num: 3 } } });
    page.data.selectedCell = { row: 0, col: 2 };
    page.onNumberClick({ currentTarget: { dataset: { num: 4 } } });
    page.data.selectedCell = { row: 0, col: 3 };
    page.onNumberClick({ currentTarget: { dataset: { num: 1 } } });
    expect(page.undoHistory).toHaveLength(3);
    page.undoLast();
    page.undoLast();
    page.undoLast();
    expect(page.data.grid[0][0].value).toBe(2);
    expect(page.data.grid[0][1].value).toBe(0);
    expect(page.data.grid[0][2].value).toBe(0);
    expect(page.data.grid[0][3].value).toBe(0);
    expect(page.data.canUndo).toBe(false);
    expect(pkMock.forceSync).toHaveBeenCalledTimes(3);
    expect(pkMock.forceSync).toHaveBeenLastCalledWith('pk-1', 0, expect.any(Array), 3);
  });

  test('PK 重复操作已有位置只占一个名额并恢复首次修改前的值', function () {
    var page = makePage();
    page.applyMatchData(makeMatch());
    page.data.selectedCell = { row: 0, col: 0 };
    page.onNumberClick({ currentTarget: { dataset: { num: 1 } } });
    page.data.selectedCell = { row: 0, col: 1 };
    page.onNumberClick({ currentTarget: { dataset: { num: 2 } } });
    page.data.selectedCell = { row: 0, col: 0 };
    page.onNumberClick({ currentTarget: { dataset: { num: 3 } } });
    expect(page.undoHistory).toHaveLength(2);
    page.undoLast();
    expect(page.data.grid[0][0].value).toBe(0);
    page.undoLast();
    expect(page.data.grid[0][1].value).toBe(0);
  });

  test('PK 进入下一局后不能退回上一局的操作', function () {
    var page = makePage();
    page.applyMatchData(makeMatch());
    page.undoHistory = [{ row: 0, col: 0, value: 0 }];
    page.data.canUndo = true;
    var nextMatch = makeMatch();
    nextMatch.playerStates['0'].currentRound = 2;
    page.applyMatchData(nextMatch);
    expect(page.undoHistory).toEqual([]);
    expect(page.data.canUndo).toBe(false);
  });

  test('提交期间禁止重复提交', async function () {
    var submit = deferred();
    pkMock.submitRound.mockReturnValue(submit.promise);
    var page = makePage();
    page.applyMatchData(makeMatch());
    page.submitAnswer();
    page.submitAnswer();
    await flush();
    expect(page.data.submitting).toBe(true);
    expect(pkMock.submitRound).toHaveBeenCalledTimes(1);
    submit.resolve({ ok: false, error: '测试拒绝' });
    await flush();
    expect(page.data.submitting).toBe(false);
  });
});
