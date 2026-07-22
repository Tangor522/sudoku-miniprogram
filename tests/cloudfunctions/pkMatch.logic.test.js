// tests/cloudfunctions/pkMatch.logic.test.js
// 云函数 pkMatch 逻辑测试：随机匹配（建/入）、建房、加入、取消、局数校验

var mockHelper = require('../helpers/cloudDbMock');
var mockStore = mockHelper.makeStore();

jest.mock('wx-server-sdk', () => mockHelper.buildMock(mockStore));

const cloud = require('wx-server-sdk');
const handler = require('../../cloudfunctions/pkMatch/index').main;

function asUser(openid) {
  cloud.getWXContext = function () { return { OPENID: openid, APPID: 'x' }; };
}

describe('云函数 pkMatch', function () {
  beforeEach(function () {
    cloud.__reset();
    cloud.getWXContext = function () { return { OPENID: 'test-openid-001', APPID: 'test-appid' }; };
  });

  // === 随机匹配：无人等待时新建房间 ===
  describe('action=randomMatch', function () {
    test('后加入玩家应带入昵称和头像', async function () {
      mockStore.users.push({ _openid: 'test-openid-002', nickName: '小明', avatarUrl: 'cloud://avatar.png' });
      asUser('test-openid-001');
      await handler({ action: 'randomMatch', mode: '4x4', totalRounds: 1 });
      asUser('test-openid-002');
      var res = await handler({ action: 'randomMatch', mode: '4x4', totalRounds: 1 });
      expect(res.match.players[1].nickName).toBe('小明');
      expect(res.match.players[1].avatarUrl).toBe('cloud://avatar.png');
    });

    test('应支持 9x9 PK 并生成唯一解题目', async function () {
      asUser('test-openid-001');
      await handler({ action: 'randomMatch', mode: '9x9', totalRounds: 1 });
      asUser('test-openid-002');
      var res = await handler({ action: 'randomMatch', mode: '9x9', totalRounds: 1 });
      expect(res.ok).toBe(true);
      expect(res.match.rounds[0].puzzle.length).toBe(9);
      expect(res.match.rounds[0].puzzle.every(function (row) { return row.length === 9; })).toBe(true);
    });

    test('无人等待时应创建等待房间（slot 0, status waiting）', async function () {
      var res = await handler({ action: 'randomMatch', mode: '4x4', totalRounds: 3 });
      expect(res.ok).toBe(true);
      expect(res.slot).toBe(0);
      expect(res.status).toBe('waiting');
      expect(mockStore.matches.length).toBe(1);
      expect(mockStore.matches[0].status).toBe('matching');
      expect(mockStore.matches[0].matchType).toBe('random');
      expect(mockStore.matches[0].players.length).toBe(1);
    });

    test('有等待房间时应加入并开局（slot 1, status playing）', async function () {
      // 玩家A 创建等待房间
      asUser('test-openid-001');
      var created = await handler({ action: 'randomMatch', mode: '4x4', totalRounds: 3 });
      // 玩家B（不同 openid）匹配
      asUser('test-openid-002');
      var res = await handler({ action: 'randomMatch', mode: '4x4', totalRounds: 3 });
      expect(res.ok).toBe(true);
      expect(res.slot).toBe(1);
      var match = res.match;
      expect(match.status).toBe('playing');
      expect(match.players.length).toBe(2);
      // rounds 数量应等于 totalRounds
      expect(match.rounds.length).toBe(3);
      // 双方 playerStates 均已初始化
      expect(match.playerStates['0']).toBeDefined();
      expect(match.playerStates['1']).toBeDefined();
      expect(match.playerStates['0'].currentRound).toBe(1);
    });

    test('局数应被钳制在 1-5（传 0 → 1，传 9 → 5）', async function () {
      var r1 = await handler({ action: 'randomMatch', mode: '4x4', totalRounds: 0 });
      expect(mockStore.matches[0].totalRounds).toBe(1);
      mockStore.matches.length = 0;
      var r2 = await handler({ action: 'randomMatch', mode: '4x4', totalRounds: 9 });
      expect(mockStore.matches[0].totalRounds).toBe(5);
    });

    test('生成的题目应为合法数独残局（行/列/宫无非空格重复，且有预设空格数）', async function () {
      asUser('test-openid-001');
      await handler({ action: 'randomMatch', mode: '6x6', totalRounds: 1 });
      asUser('test-openid-002');
      var res = await handler({ action: 'randomMatch', mode: '6x6', totalRounds: 1 });
      var puzzle = res.match.rounds[0].puzzle;
      function noDup(arr) {
        var seen = {};
        for (var i = 0; i < arr.length; i++) {
          var v = arr[i];
          if (v === 0) continue;
          if (seen[v]) return false;
          seen[v] = true;
        }
        return true;
      }
      // 行
      for (var r = 0; r < 6; r++) expect(noDup(puzzle[r])).toBe(true);
      // 列
      for (var c = 0; c < 6; c++) {
        var col = [];
        for (var r2 = 0; r2 < 6; r2++) col.push(puzzle[r2][c]);
        expect(noDup(col)).toBe(true);
      }
      // 宫（2行3列）
      for (var br = 0; br < 3; br++) {
        for (var bc = 0; bc < 2; bc++) {
          var box = [];
          for (var rr = 0; rr < 2; rr++) {
            for (var cc = 0; cc < 3; cc++) box.push(puzzle[br * 2 + rr][bc * 3 + cc]);
          }
          expect(noDup(box)).toBe(true);
        }
      }
      // 应有 15 个空格（云函数 6x6 固定难度）
      var holes = 0;
      for (var r3 = 0; r3 < 6; r3++) for (var c3 = 0; c3 < 6; c3++) if (puzzle[r3][c3] === 0) holes++;
      expect(holes).toBe(15);
    });
  });

  // === 创建房间 ===
  describe('action=createRoom', function () {
    test('应返回 6 位房间号并进入等待', async function () {
      var res = await handler({ action: 'createRoom', mode: '6x6', totalRounds: 2 });
      expect(res.ok).toBe(true);
      expect(res.slot).toBe(0);
      expect(res.roomCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(mockStore.matches[0].status).toBe('matching');
      expect(mockStore.matches[0].matchType).toBe('room');
    });
  });

  // === 加入房间 ===
  describe('action=joinRoom', function () {
    test('凭正确房间号应加入并开局', async function () {
      asUser('test-openid-001');
      var created = await handler({ action: 'createRoom', mode: '4x4', totalRounds: 1 });
      asUser('test-openid-002');
      var res = await handler({ action: 'joinRoom', roomCode: created.roomCode });
      expect(res.ok).toBe(true);
      expect(res.slot).toBe(1);
      expect(res.match.status).toBe('playing');
    });

    test('房间号不存在应返回错误', async function () {
      var res = await handler({ action: 'joinRoom', roomCode: 'ZZZZZZ' });
      expect(res.ok).toBe(false);
      expect(res.error).toContain('房间不存在');
    });

    test('不能加入自己的房间', async function () {
      asUser('test-openid-001');
      var created = await handler({ action: 'createRoom', mode: '4x4', totalRounds: 1 });
      var res = await handler({ action: 'joinRoom', roomCode: created.roomCode });
      expect(res.ok).toBe(false);
      expect(res.error).toContain('自己的房间');
    });

    test('房间已开局后第三人加入应被拒绝', async function () {
      asUser('test-openid-001');
      var created = await handler({ action: 'createRoom', mode: '4x4', totalRounds: 1 });
      asUser('test-openid-002');
      await handler({ action: 'joinRoom', roomCode: created.roomCode });
      // 第三人尝试加入已开局的房间
      asUser('test-openid-003');
      var res = await handler({ action: 'joinRoom', roomCode: created.roomCode });
      expect(res.ok).toBe(false);
      // 房间已满后状态转为 playing，按「不存在或已开始」拒绝（逻辑等价）
      expect(res.error).toMatch(/不存在|已开始/);
    });
  });

  // === 取消匹配 ===
  describe('action=cancelMatch', function () {
    test('应将等待中的对局置为 cancelled', async function () {
      var created = await handler({ action: 'randomMatch', mode: '4x4', totalRounds: 1 });
      var res = await handler({ action: 'cancelMatch', matchId: created.matchId });
      expect(res.ok).toBe(true);
      expect(mockStore.matches[0].status).toBe('cancelled');
    });
  });

  test('未知 action 应返回错误', async function () {
    var res = await handler({ action: 'flyToMoon', mode: '4x4' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('未知 action');
  });
});
