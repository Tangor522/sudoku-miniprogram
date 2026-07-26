// tests/cloudfunctions/pkSubmit.logic.test.js
// 云函数 pkSubmit 逻辑测试：单局提交、推进、错答拒绝、结算、胜负判定、写战绩

var mockHelper = require('../helpers/cloudDbMock');
var mockStore = mockHelper.makeStore();

jest.mock('wx-server-sdk', () => mockHelper.buildMock(mockStore));

const cloud = require('wx-server-sdk');
const handler = require('../../cloudfunctions/pkSubmit/index').main;

// 合法 4x4 完整解
var SOL4 = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]];
var SOL9 = [
  [1,2,3,4,5,6,7,8,9], [4,5,6,7,8,9,1,2,3], [7,8,9,1,2,3,4,5,6],
  [2,3,4,5,6,7,8,9,1], [5,6,7,8,9,1,2,3,4], [8,9,1,2,3,4,5,6,7],
  [3,4,5,6,7,8,9,1,2], [6,7,8,9,1,2,3,4,5], [9,1,2,3,4,5,6,7,8]
];

function makeMatch(totalRounds, overrides) {
  var rounds = [];
  for (var i = 0; i < totalRounds; i++) rounds.push({ puzzle: SOL4 });
  var base = {
    _id: 'm1',
    status: 'playing',
    mode: '4x4',
    totalRounds: totalRounds,
    matchType: 'random',
    players: [
      { openid: 'test-openid-001', nickName: 'A', avatarUrl: '', slot: 0, connected: true, lastActive: Date.now() },
      { openid: 'test-openid-002', nickName: 'B', avatarUrl: '', slot: 1, connected: true, lastActive: Date.now() }
    ],
    rounds: rounds,
    playerStates: {
      '0': { ready: true, currentRound: 1, roundStartTimes: [Date.now()], roundTimes: [], finished: false, totalTime: 0 },
      '1': { ready: true, currentRound: 1, roundStartTimes: [Date.now()], roundTimes: [], finished: false, totalTime: 0 }
    },
    progress: { '0': { grid: null, updatedAt: 0 }, '1': { grid: null, updatedAt: 0 } },
    disconnect: { '0': { offline: false }, '1': { offline: false } },
    winnerSlot: null, finishedAt: null, createdAt: Date.now(), updatedAt: Date.now()
  };
  return Object.assign(base, overrides || {});
}

function asUser(openid) {
  cloud.getWXContext = function () { return { OPENID: openid, APPID: 'x' }; };
}

describe('云函数 pkSubmit', function () {
  beforeEach(function () {
    cloud.__reset();
    cloud.getWXContext = function () { return { OPENID: 'test-openid-001', APPID: 'test-appid' }; };
  });

  test('正确提交第1局应推进到下一局', async function () {
    asUser('test-openid-001');
    mockStore.matches.push(makeMatch(2));
    var res = await handler({ matchId: 'm1', grid: SOL4 });
    expect(res.ok).toBe(true);
    expect(res.matchFinished).toBe(false);
    expect(res.nextRound).toBe(2);
    expect(mockStore.matches[0].playerStates['0'].currentRound).toBe(2);
    expect(mockStore.matches[0].playerStates['0'].roundTimes.length).toBe(1);
    expect(mockStore.matches[0].playerStates['0'].totalTime).toBeGreaterThan(0);
  });

  test('完成全部局数应结算并判本人获胜', async function () {
    asUser('test-openid-001');
    mockStore.matches.push(makeMatch(1));
    var res = await handler({ matchId: 'm1', grid: SOL4 });
    expect(res.ok).toBe(true);
    expect(res.matchFinished).toBe(true);
    expect(res.iWon).toBe(true);
    expect(res.winnerSlot).toBe(0);
    expect(mockStore.matches[0].status).toBe('finished');

    // pk_records 应写入双方战绩
    expect(mockStore.pk_records.length).toBe(2);
    var myRec = mockStore.pk_records.find(function (r) { return r._openid === 'test-openid-001'; });
    var oppRec = mockStore.pk_records.find(function (r) { return r._openid === 'test-openid-002'; });
    expect(myRec.result).toBe('win');
    expect(oppRec.result).toBe('lose');
    expect(myRec.roundsDetail.length).toBe(1);
    expect(myRec.roundsDetail[0].myTime).toBeGreaterThan(0);
    expect(mockStore.matches[0].playerStates['0'].roundTimes[0]).toBeGreaterThan(0);
  });

  test('多局累计用时应正确累加', async function () {
    asUser('test-openid-001');
    mockStore.matches.push(makeMatch(2));
    await handler({ matchId: 'm1', grid: SOL4 }); // 第1局
    await new Promise(function (r) { setTimeout(r, 5); });
    var res2 = await handler({ matchId: 'm1', grid: SOL4 }); // 第2局（最后一局）
    expect(res2.matchFinished).toBe(true);
    var st = mockStore.matches[0].playerStates['0'];
    expect(st.totalTime).toBe(st.roundTimes[0] + st.roundTimes[1]);
    expect(res2.myTotalTime).toBe(st.totalTime);
  });

  test('三局的每局开始时间和最后总用时都必须完整保存', async function () {
    asUser('test-openid-001');
    mockStore.matches.push(makeMatch(3));
    await handler({ matchId: 'm1', grid: SOL4 });
    var afterFirst = mockStore.matches[0].playerStates['0'];
    expect(afterFirst.roundStartTimes).toHaveLength(2);
    expect(afterFirst.roundStartTimes[1]).toBeGreaterThan(0);
    await handler({ matchId: 'm1', grid: SOL4 });
    var afterSecond = mockStore.matches[0].playerStates['0'];
    expect(afterSecond.roundStartTimes).toHaveLength(3);
    expect(afterSecond.roundStartTimes[2]).toBeGreaterThan(0);
    var finalRes = await handler({ matchId: 'm1', grid: SOL4 });
    var finalState = mockStore.matches[0].playerStates['0'];
    expect(finalRes.matchFinished).toBe(true);
    expect(finalState.roundTimes).toHaveLength(3);
    expect(finalState.roundTimes.every(function (t) { return t > 0; })).toBe(true);
    expect(finalState.totalTime).toBe(finalState.roundTimes.reduce(function (sum, t) { return sum + t; }, 0));
  });

  test('旧版对局缺少当局开始时间时不得记为假 00:00.0', async function () {
    asUser('test-openid-001');
    var m = makeMatch(3);
    m.playerStates['0'].currentRound = 3;
    m.playerStates['0'].roundStartTimes = [Date.now() - 30000, Date.now() - 20000];
    m.playerStates['0'].roundTimes = [10000, 10000];
    m.playerStates['0'].totalTime = 20000;
    m.updatedAt = Date.now() - 5000;
    mockStore.matches.push(m);
    var res = await handler({ matchId: 'm1', grid: SOL4 });
    expect(res.ok).toBe(true);
    expect(res.roundTime).toBeGreaterThanOrEqual(5000);
    expect(mockStore.matches[0].playerStates['0'].roundTimes[2]).toBeGreaterThanOrEqual(5000);
  });

  test('与题目线索冲突的答案应被拒绝（error=答案与题目不匹配）', async function () {
    asUser('test-openid-001');
    mockStore.matches.push(makeMatch(1));
    var wrong = SOL4.map(function (row) { return row.slice(); });
    wrong[0][0] = 2; // 与线索(0,0)=1 冲突（puzzle 为完整解，该格非空格）
    var res = await handler({ matchId: 'm1', grid: wrong });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('题目');
    expect(mockStore.matches[0].status).toBe('playing'); // 未结算
  });

  test('未填完（存在空格）的答案应被拒绝（reason=wrong）', async function () {
    asUser('test-openid-001');
    // 构造带空格的题目：puzzle[3][3]=0（空格），其余为 SOL4
    var puzzle = SOL4.map(function (row) { return row.slice(); });
    puzzle[3][3] = 0;
    var m = makeMatch(1, { rounds: [{ puzzle: puzzle }] });
    mockStore.matches.push(m);
    // 提交的 grid 在空格处留空，其余与 SOL4 一致
    var incomplete = SOL4.map(function (row) { return row.slice(); });
    incomplete[3][3] = 0;
    var res = await handler({ matchId: 'm1', grid: incomplete });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('wrong');
  });

  test('九宫格即使提交另一份规则合法终盘，也必须按该局唯一正解拒绝', async function () {
    asUser('test-openid-001');
    var empty9 = SOL9.map(function (row) { return row.map(function () { return 0; }); });
    var alternate = SOL9.map(function (row) {
      return row.map(function (value) { return value === 1 ? 2 : (value === 2 ? 1 : value); });
    });
    var m = makeMatch(1, {
      mode: '9x9',
      rounds: [{ puzzle: empty9, solution: SOL9 }]
    });
    mockStore.matches.push(m);
    var res = await handler({ matchId: 'm1', grid: alternate });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('wrong');
    expect(mockStore.matches[0].status).toBe('playing');
    expect(mockStore.pk_records).toHaveLength(0);
  });

  test('非本局玩家提交应报错', async function () {
    asUser('test-openid-999'); // 不在 players 中
    mockStore.matches.push(makeMatch(1));
    var res = await handler({ matchId: 'm1', grid: SOL4 });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('非本局玩家');
  });

  test('对局已结束后提交应报错', async function () {
    asUser('test-openid-001');
    mockStore.matches.push(makeMatch(1, { status: 'finished', winnerSlot: 1 }));
    var res = await handler({ matchId: 'm1', grid: SOL4 });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('已结束');
  });

  test('已完成全部局数后再次提交应报错', async function () {
    asUser('test-openid-001');
    var m = makeMatch(1);
    m.playerStates['0'].finished = true;
    mockStore.matches.push(m);
    var res = await handler({ matchId: 'm1', grid: SOL4 });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('已完成');
  });

  // 防御性分支：若对手已结束（异常状态），按总用时判定（生产环境不可达，仅验证不崩溃）
  test('防御分支：对手已结束时按总用时判定获胜方', async function () {
    asUser('test-openid-001');
    var m = makeMatch(1);
    m.playerStates['1'].finished = true;
    m.playerStates['1'].totalTime = 0;   // 对手用时 0
    m.playerStates['0'].totalTime = 0;   // 本人用时 0，提交后 >0
    m.playerStates['0'].roundStartTimes = [Date.now() - 10000]; // 用过去时间，保证 usedTime>0
    mockStore.matches.push(m);
    var res = await handler({ matchId: 'm1', grid: SOL4 });
    expect(res.ok).toBe(true);
    expect(res.matchFinished).toBe(true);
    expect(res.winnerSlot).toBe(1); // 本人用时 > 对手 → 对手胜
  });
});
