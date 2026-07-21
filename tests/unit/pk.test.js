// tests/unit/pk.test.js
// 白盒：PK 功能封装（云函数调用映射 + 轮询 + 进度同步节流 + 心跳 + 当前对战缓存）

const { makeWxMock, installWx } = require('../helpers/wxMock');

async function flush(n) {
  n = n || 6;
  for (var i = 0; i < n; i++) { await Promise.resolve(); }
}

describe('utils/pk PK 功能封装', function () {
  var mock, pk;
  beforeEach(function () {
    jest.resetModules();
    mock = makeWxMock();
    mock.globalData = { cloudReady: true };
    installWx(mock);
    pk = require('../../utils/pk');
  });
  afterEach(function () {
    jest.restoreAllMocks();
  });

  // --- 云函数调用映射 ---
  var callTests = [
    ['randomMatch', function () { return pk.randomMatch('4x4', 3); }, { name: 'pkMatch', data: { action: 'randomMatch', mode: '4x4', totalRounds: 3 } }],
    ['createRoom', function () { return pk.createRoom('6x6', 2); }, { name: 'pkMatch', data: { action: 'createRoom', mode: '6x6', totalRounds: 2 } }],
    ['joinRoom', function () { return pk.joinRoom('ABC123'); }, { name: 'pkMatch', data: { action: 'joinRoom', roomCode: 'ABC123' } }],
    ['cancelMatch', function () { return pk.cancelMatch('m1'); }, { name: 'pkMatch', data: { action: 'cancelMatch', matchId: 'm1' } }],
    ['setReady', function () { return pk.setReady('m1'); }, { name: 'pkState', data: { action: 'setReady', matchId: 'm1' } }],
    ['submitRound', function () { return pk.submitRound('m1', [1, 2, 3]); }, { name: 'pkSubmit', data: { matchId: 'm1', grid: [1, 2, 3] } }],
    ['reconnect', function () { return pk.reconnect('m1'); }, { name: 'pkState', data: { action: 'reconnect', matchId: 'm1' } }],
    ['surrender', function () { return pk.surrender('m1'); }, { name: 'pkState', data: { action: 'surrender', matchId: 'm1' } }],
    ['markOffline', function () { return pk.markOffline('m1'); }, { name: 'pkState', data: { action: 'markOffline', matchId: 'm1' } }],
    ['timeoutLoss', function () { return pk.timeoutLoss('m1'); }, { name: 'pkState', data: { action: 'timeoutLoss', matchId: 'm1' } }],
    ['getRecords', function () { return pk.getRecords(10, 0); }, { name: 'pkRecord', data: { action: 'list', limit: 10, skip: 0 } }],
    ['getStats', function () { return pk.getStats(); }, { name: 'pkRecord', data: { action: 'stats' } }]
  ];

  callTests.forEach(function (t) {
    test(t[0] + ' 调用正确的云函数与参数', async function () {
      var captured;
      mock.wx.cloud.callFunctionImpl = function (opt) { captured = opt; return Promise.resolve({ result: { ok: true } }); };
      var res = await t[1]();
      expect(captured.name).toBe(t[2].name);
      expect(captured.data).toEqual(t[2].data);
      expect(res.ok).toBe(true);
    });
  });

  // --- 轮询 ---
  describe('pollMatch 轮询', function () {
    beforeEach(function () { jest.useFakeTimers(); });
    afterEach(function () { jest.useRealTimers(); });

    test('首次拉取成功 → onChange 收到 match，并每 1.5s 重排，close 后停止', async function () {
      mock.wx.cloud.callFunctionImpl = function () {
        return Promise.resolve({ result: { ok: true, match: { _id: 'm1', status: 'playing' } } });
      };
      var count = 0;
      var poller = pk.pollMatch('m1', function () { count++; });
      await flush();
      expect(count).toBe(1);
      jest.advanceTimersByTime(1500);
      await flush();
      expect(count).toBe(2);
      poller.close();
      jest.advanceTimersByTime(1500);
      await flush();
      expect(count).toBe(2);
    });

    test('拉取失败（ok=false）→ 回调 onError', async function () {
      mock.wx.cloud.callFunctionImpl = function () {
        return Promise.resolve({ result: { ok: false, error: '对局不存在' } });
      };
      var err = null;
      pk.pollMatch('m1', function () {}, function (e) { err = e; });
      await flush();
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('对局不存在');
    });

    test('网络异常 → 回调 onError', async function () {
      mock.wx.cloud.callFunctionImpl = function () { return Promise.reject(new Error('network')); };
      var err = null;
      pk.pollMatch('m1', function () {}, function (e) { err = e; });
      await flush();
      expect(err).toBeInstanceOf(Error);
    });
  });

  // --- 进度同步节流 ---
  describe('syncProgress / forceSync / heartbeat 节流', function () {
    test('syncProgress 2 秒内节流', function () {
      jest.spyOn(Date, 'now').mockReturnValue(10000000);
      var n = 0;
      mock.wx.cloud.callFunctionImpl = function () { n++; return Promise.resolve({ result: {} }); };
      pk.syncProgress('m1', 0, [1]);
      pk.syncProgress('m1', 0, [1]); // 2s 内 → 节流
      expect(n).toBe(1);
      Date.now.mockReturnValue(10002001); // 2s 后
      pk.syncProgress('m1', 0, [1]);
      expect(n).toBe(2);
    });

    test('forceSync 不受节流限制', async function () {
      jest.spyOn(Date, 'now').mockReturnValue(20000000);
      var n = 0;
      mock.wx.cloud.callFunctionImpl = function () { n++; return Promise.resolve({ result: {} }); };
      await pk.forceSync('m1', 0, [1]);
      await pk.forceSync('m1', 0, [1]);
      expect(n).toBe(2);
    });

    test('heartbeat 10 秒内节流', function () {
      jest.spyOn(Date, 'now').mockReturnValue(30000000);
      var n = 0;
      mock.wx.cloud.callFunctionImpl = function () { n++; return Promise.resolve({ result: {} }); };
      pk.heartbeat('m1', 0);
      pk.heartbeat('m1', 0); // 10s 内 → 节流
      expect(n).toBe(1);
      Date.now.mockReturnValue(30010001); // 10s 后
      pk.heartbeat('m1', 0);
      expect(n).toBe(2);
    });
  });

  // --- 当前对战缓存 ---
  test('setActiveMatch / getActiveMatch / clearActiveMatch', function () {
    expect(pk.getActiveMatch()).toBeNull();
    pk.setActiveMatch('m1', 0, '4x4');
    expect(pk.getActiveMatch()).toEqual({ matchId: 'm1', slot: 0, mode: '4x4' });
    pk.clearActiveMatch();
    expect(pk.getActiveMatch()).toBeNull();
  });
});
