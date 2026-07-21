// tests/cloudfunctions/pkState.logic.test.js
// 云函数 pkState 逻辑测试（mock wx-server-sdk）
// 重点测试新增的 getMatch / syncProgress / heartbeat / setReady 动作

// --- 内存模拟 matches 集合 ---
var matches = [];

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test-env',
  database: () => ({
    collection: (name) => ({
      doc: (id) => ({
        get: async () => {
          var doc = matches.find(m => m._id === id);
          return { data: doc || null };
        },
        update: async (opt) => {
          var doc = matches.find(m => m._id === id);
          if (!doc) return { stats: { updated: 0 } };
          // 支持嵌套路径更新（如 playerStates.0.ready）
          var data = opt.data;
          for (var key in data) {
            if (key.indexOf('.') > -1) {
              var parts = key.split('.');
              var obj = doc;
              for (var i = 0; i < parts.length - 1; i++) {
                if (!obj[parts[i]]) obj[parts[i]] = {};
                obj = obj[parts[i]];
              }
              obj[parts[parts.length - 1]] = data[key];
            } else {
              doc[key] = data[key];
            }
          }
          return { stats: { updated: 1 } };
        },
      }),
      add: async (opt) => {
        var id = 'id-' + Date.now() + '-' + Math.random();
        matches.push(Object.assign({ _id: id }, opt.data));
        return { _id: id };
      },
    }),
  }),
  getWXContext: () => ({ OPENID: 'test-openid-001', APPID: 'test-appid' }),
  __matches: matches,
}));

const cloud = require('wx-server-sdk');
const handler = require('../../cloudfunctions/pkState/index').main;

// 辅助：创建一个测试对局
function createTestMatch(overrides) {
  var base = {
    _id: 'match-test-001',
    status: 'playing',
    mode: '4x4',
    totalRounds: 3,
    matchType: 'random',
    players: [
      { openid: 'test-openid-001', nickName: '玩家A', avatarUrl: '', connected: true, lastActive: Date.now() },
      { openid: 'test-openid-002', nickName: '玩家B', avatarUrl: '', connected: true, lastActive: Date.now() }
    ],
    playerStates: {
      '0': { ready: false, currentRound: 1, totalTime: 0, roundTimes: [] },
      '1': { ready: false, currentRound: 1, totalTime: 0, roundTimes: [] }
    },
    progress: {
      '0': { grid: null, updatedAt: 0 },
      '1': { grid: null, updatedAt: 0 }
    },
    disconnect: {
      '0': { offline: false, offlineAt: null },
      '1': { offline: false, offlineAt: null }
    },
    rounds: [
      { puzzle: [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]], solution: [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]] },
      { puzzle: [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]], solution: [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]] },
      { puzzle: [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]], solution: [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]] }
    ],
    winnerSlot: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  return Object.assign(base, overrides || {});
}

describe('云函数 pkState', function () {

  beforeEach(function () {
    matches.length = 0;
  });

  // === getMatch：轮询拉取对局数据 ===
  describe('action=getMatch', function () {
    test('应返回完整的对局数据', async function () {
      var m = createTestMatch();
      matches.push(m);

      var res = await handler({ action: 'getMatch', matchId: 'match-test-001' });
      expect(res.ok).toBe(true);
      expect(res.match).toBeDefined();
      expect(res.match._id).toBe('match-test-001');
      expect(res.match.mode).toBe('4x4');
      expect(res.match.players.length).toBe(2);
    });

    test('对局不存在时应返回错误', async function () {
      var res = await handler({ action: 'getMatch', matchId: 'not-exist' });
      expect(res.ok).toBe(false);
      expect(res.error).toBe('对局不存在');
    });
  });

  // === syncProgress：同步棋盘进度 ===
  describe('action=syncProgress', function () {
    test('应更新己方棋盘进度', async function () {
      var m = createTestMatch();
      matches.push(m);

      var grid = [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]];
      var res = await handler({ action: 'syncProgress', matchId: 'match-test-001', grid: grid });
      expect(res.ok).toBe(true);

      // 验证数据已写入
      var fresh = matches[0];
      expect(fresh.progress['0'].grid).toEqual(grid);
      expect(fresh.progress['0'].updatedAt).toBeGreaterThan(0);
    });

    test('对局已结束时不应同步', async function () {
      var m = createTestMatch({ status: 'finished' });
      matches.push(m);

      var res = await handler({ action: 'syncProgress', matchId: 'match-test-001', grid: [[1]] });
      expect(res.ok).toBe(false);
      expect(res.error).toBe('对局已结束');
    });
  });

  // === heartbeat：心跳 ===
  describe('action=heartbeat', function () {
    test('应更新玩家最后活跃时间', async function () {
      var m = createTestMatch();
      matches.push(m);
      var oldActive = m.players[0].lastActive;

      // 等一小段时间确保时间不同
      await new Promise(function (r) { setTimeout(r, 10); });

      var res = await handler({ action: 'heartbeat', matchId: 'match-test-001' });
      expect(res.ok).toBe(true);
      expect(matches[0].players[0].lastActive).toBeGreaterThan(oldActive);
    });

    test('对局已结束时不应心跳', async function () {
      var m = createTestMatch({ status: 'finished' });
      matches.push(m);

      var res = await handler({ action: 'heartbeat', matchId: 'match-test-001' });
      expect(res.ok).toBe(false);
      expect(res.error).toBe('对局已结束');
    });
  });

  // === setReady：标记准备 ===
  describe('action=setReady', function () {
    test('应标记己方已准备', async function () {
      var m = createTestMatch();
      matches.push(m);

      var res = await handler({ action: 'setReady', matchId: 'match-test-001' });
      expect(res.ok).toBe(true);
      expect(res.myReady).toBe(true);
      expect(res.oppReady).toBe(false);
      expect(res.bothReady).toBe(false);
    });

    test('双方都准备后应返回 bothReady=true', async function () {
      var m = createTestMatch({
        playerStates: {
          '0': { ready: false, currentRound: 1, totalTime: 0, roundTimes: [] },
          '1': { ready: true, currentRound: 1, totalTime: 0, roundTimes: [] }
        }
      });
      matches.push(m);

      var res = await handler({ action: 'setReady', matchId: 'match-test-001' });
      expect(res.ok).toBe(true);
      expect(res.myReady).toBe(true);
      expect(res.oppReady).toBe(true);
      expect(res.bothReady).toBe(true);
    });

    test('对局已结束时不应准备', async function () {
      var m = createTestMatch({ status: 'finished' });
      matches.push(m);

      var res = await handler({ action: 'setReady', matchId: 'match-test-001' });
      expect(res.ok).toBe(false);
    });
  });

  // === reconnect：重连 ===
  describe('action=reconnect', function () {
    test('应清除掉线状态并返回对局数据', async function () {
      var m = createTestMatch({
        disconnect: {
          '0': { offline: true, offlineAt: 1000 },
          '1': { offline: false, offlineAt: null }
        }
      });
      matches.push(m);

      var res = await handler({ action: 'reconnect', matchId: 'match-test-001' });
      expect(res.ok).toBe(true);
      expect(res.match).toBeDefined();
      expect(matches[0].disconnect['0'].offline).toBe(false);
      expect(matches[0].players[0].connected).toBe(true);
    });
  });

  // === surrender：认输 ===
  describe('action=surrender', function () {
    test('应判对方获胜并结束对局', async function () {
      var m = createTestMatch();
      matches.push(m);

      var res = await handler({ action: 'surrender', matchId: 'match-test-001' });
      expect(res.ok).toBe(true);
      expect(res.winnerSlot).toBe(1); // 对手获胜
      expect(matches[0].status).toBe('finished');
      expect(matches[0].winnerSlot).toBe(1);
    });
  });

  // === 未知 action ===
  test('未知 action 应返回错误', async function () {
    var m = createTestMatch();
    matches.push(m);

    var res = await handler({ action: 'unknownAction', matchId: 'match-test-001' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('未知 action');
  });
});
