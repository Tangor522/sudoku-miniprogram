// 页面产品行为验收：异步竞态、分享深链、离开清理与刷新状态。

function deferred() {
  var resolve;
  var reject;
  var promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
  return { promise: promise, resolve: resolve, reject: reject };
}

function instantiate(definition) {
  var page = {};
  Object.keys(definition).forEach(function (key) { page[key] = definition[key]; });
  page.data = JSON.parse(JSON.stringify(definition.data));
  page.setData = function (patch) { Object.assign(page.data, patch); };
  return page;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('成长记录页', function () {
  var definition;
  var cloudMock;

  beforeEach(function () {
    jest.resetModules();
    global.Page = function (value) { definition = value; };
    global.wx = {};
    cloudMock = { isReady: jest.fn(function () { return true; }), getStats: jest.fn() };
    jest.doMock('../../utils/store', function () { return { subscribe: jest.fn(), getState: jest.fn(function () { return { openid: 'me' }; }) }; });
    jest.doMock('../../utils/theme', function () { return { injectTheme: jest.fn() }; });
    jest.doMock('../../utils/cloud', function () { return cloudMock; });
    jest.doMock('../../utils/storage', function () { return { getStats: jest.fn(function () { return []; }) }; });
    jest.doMock('../../utils/timer', function () { return { formatStopwatch: jest.fn(function () { return '00:01.0'; }) }; });
    require('../../pages/stats/stats.js');
  });

  afterEach(function () { delete global.Page; delete global.wx; });

  test('快速切换模式时，旧请求不得覆盖新模式记录', async function () {
    var four = deferred();
    var nine = deferred();
    cloudMock.getStats.mockImplementation(function (mode) { return mode === '4x4' ? four.promise : nine.promise; });
    var page = instantiate(definition);
    page.loadRecords();
    page.switchMode({ currentTarget: { dataset: { mode: '9x9' } } });
    four.resolve([{ level: 4, usedTime: 1, completedAt: Date.now() }]);
    await flush();
    expect(page.data.gameMode).toBe('9x9');
    expect(page.data.records).toEqual([]);
    expect(page.data.loading).toBe(true);
    nine.resolve([{ level: 9, usedTime: 1, completedAt: Date.now() }]);
    await flush();
    expect(page.data.records[0].level).toBe(9);
    expect(page.data.loading).toBe(false);
  });
});

describe('PK 大厅页', function () {
  var definition;
  var pkMock;
  var currentUser;
  var cache;

  beforeEach(function () {
    jest.resetModules();
    cache = {};
    currentUser = null;
    global.Page = function (value) { definition = value; };
    global.wx = {
      setStorageSync: jest.fn(function (key, value) { cache[key] = value; }),
      getStorageSync: jest.fn(function (key) { return cache[key]; }),
      removeStorageSync: jest.fn(function (key) { delete cache[key]; }),
      showLoading: jest.fn(), hideLoading: jest.fn(), redirectTo: jest.fn()
    };
    pkMock = {
      cancelMatch: jest.fn(function () { return Promise.resolve({ ok: true }); }),
      joinRoom: jest.fn(), setActiveMatch: jest.fn(), pollMatch: jest.fn()
    };
    jest.doMock('../../utils/pk', function () { return pkMock; });
    jest.doMock('../../utils/store', function () { return { subscribe: jest.fn(), getState: jest.fn(function () { return currentUser; }) }; });
    jest.doMock('../../utils/theme', function () { return { injectTheme: jest.fn() }; });
    jest.doMock('../../utils/auth', function () { return { requireLogin: jest.fn(function () { return !!currentUser; }) }; });
    jest.doMock('../../utils/cloud', function () { return { isReady: jest.fn(function () { return false; }) }; });
    require('../../pages/pk_lobby/pk_lobby.js');
  });

  afterEach(function () { delete global.Page; delete global.wx; });

  test('分享房间号经过登录跳转后仍能回填', function () {
    var guestPage = instantiate(definition);
    guestPage.onLoad({ roomCode: 'abc123' });
    expect(guestPage.data.inputRoomCode).toBe('ABC123');
    expect(cache.pendingPkRoomCode).toBe('ABC123');

    currentUser = { openid: 'me' };
    var loggedPage = instantiate(definition);
    loggedPage.onLoad({});
    expect(loggedPage.data.inputRoomCode).toBe('ABC123');
    expect(cache.pendingPkRoomCode).toBeUndefined();
  });

  test('加入房间后使用房主真实的棋盘模式', async function () {
    pkMock.joinRoom.mockResolvedValue({ ok: true, matchId: 'm9', match: { mode: '9x9' } });
    var page = instantiate(definition);
    page.data.inputRoomCode = 'ABC123';
    page.joinRoom();
    await flush();
    expect(pkMock.setActiveMatch).toHaveBeenCalledWith('m9', 1, '9x9');
    expect(wx.redirectTo).toHaveBeenCalled();
    expect(page.data.busyAction).toBe('');
  });

  test('等待匹配时直接离开页面会取消云端房间', function () {
    var page = instantiate(definition);
    page.waitId = 'waiting-1';
    page.onUnload();
    expect(pkMock.cancelMatch).toHaveBeenCalledWith('waiting-1');
  });

  test('本地降级模式会禁用在线 PK，不发起无效请求', function () {
    currentUser = { openid: 'local' };
    var page = instantiate(definition);
    page.onShow();
    expect(page.data.isLocalMode).toBe(true);
    page.data.inputRoomCode = 'ABC123';
    page.joinRoom();
    expect(pkMock.joinRoom).not.toHaveBeenCalled();
    expect(page.data.error).toContain('暂不可用');
  });
});

describe('排行榜页', function () {
  var definition;
  var cloudMock;

  beforeEach(function () {
    jest.resetModules();
    global.Page = function (value) { definition = value; };
    global.wx = { stopPullDownRefresh: jest.fn() };
    cloudMock = { isReady: jest.fn(function () { return true; }), getRanking: jest.fn() };
    jest.doMock('../../utils/store', function () { return { subscribe: jest.fn() }; });
    jest.doMock('../../utils/theme', function () { return { injectTheme: jest.fn() }; });
    jest.doMock('../../utils/auth', function () { return { requireLogin: jest.fn(function () { return true; }) }; });
    jest.doMock('../../utils/cloud', function () { return cloudMock; });
    jest.doMock('../../utils/timer', function () {
      return { formatStopwatch: jest.fn(function () { return '00:00.0'; }), formatStopwatchParts: jest.fn(function () { return { main: '00:00', tenths: '0' }; }) };
    });
    require('../../pages/ranking/ranking.js');
  });

  afterEach(function () { delete global.Page; delete global.wx; });

  test('下拉刷新在真实请求完成后才停止动画', async function () {
    var request = deferred();
    cloudMock.getRanking.mockReturnValue(request.promise);
    var page = instantiate(definition);
    page.onPullDownRefresh();
    expect(wx.stopPullDownRefresh).not.toHaveBeenCalled();
    request.resolve({ list: [], myRank: null });
    await flush();
    expect(wx.stopPullDownRefresh).toHaveBeenCalledTimes(1);
  });

  test('连续刷新时旧排行结果不得覆盖新结果', async function () {
    var oldRequest = deferred();
    var newRequest = deferred();
    cloudMock.getRanking.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    var page = instantiate(definition);
    page.loadRanking();
    page.loadRanking();
    oldRequest.resolve({ list: [{ rank: 1, nickName: '旧数据', totalLevels: 1, totalTime: 1 }], myRank: null });
    await flush();
    expect(page.data.rankings).toEqual([]);
    newRequest.resolve({ list: [{ rank: 1, nickName: '新数据', totalLevels: 2, totalTime: 1 }], myRank: null });
    await flush();
    expect(page.data.rankings[0].nickName).toBe('新数据');
  });
});
