// tests/integration/pk-flow.test.js
// SIT 集成测试：模拟两名玩家完整 PK 流程，验证跨云函数协作、胜负判定与战绩写入。
// 覆盖：随机匹配 → 加入 → 双方准备 → 多局推进 → 结算 → 写 pk_records → 并发拒绝

var mockHelper = require('../helpers/cloudDbMock');
var mockStore = mockHelper.makeStore();

jest.mock('wx-server-sdk', () => mockHelper.buildMock(mockStore));

const cloud = require('wx-server-sdk');
const pkMatch = require('../../cloudfunctions/pkMatch/index').main;
const pkState = require('../../cloudfunctions/pkState/index').main;
const pkSubmit = require('../../cloudfunctions/pkSubmit/index').main;

var SOL4 = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]];
var A = 'test-openid-001';
var B = 'test-openid-002';

function asUser(openid) {
  cloud.getWXContext = function () { return { OPENID: openid, APPID: 'x' }; };
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
// pkMatch 生成的是随机模板题，SIT 中将其固定为已知完整解 SOL4 以便确定性提交
function setPuzzle(grid) {
  mockStore.matches[0].rounds.forEach(function (r) { r.puzzle = grid; });
}

describe('SIT：双人对战完整流程', function () {
  beforeEach(function () {
    cloud.__reset();
    cloud.getWXContext = function () { return { OPENID: A, APPID: 'test-appid' }; };
  });

  test('场景1：A 先完成全部局 → A 胜，战绩正确写入双方', async function () {
    var N = 2;
    // 1) A 发起随机匹配，进入等待
    asUser(A);
    var a = await pkMatch({ action: 'randomMatch', mode: '4x4', totalRounds: N });
    expect(a.ok).toBe(true);
    expect(a.slot).toBe(0);
    expect(a.status).toBe('waiting');
    var matchId = a.matchId;

    // 2) B 随机匹配，加入并开局
    asUser(B);
    var b = await pkMatch({ action: 'randomMatch', mode: '4x4', totalRounds: N });
    expect(b.ok).toBe(true);
    expect(b.slot).toBe(1);
    expect(b.match.status).toBe('playing');
    expect(b.match.players.length).toBe(2);

    // 3) 双方准备
    asUser(A); var ra = await pkState({ action: 'setReady', matchId: matchId });
    asUser(B); var rb = await pkState({ action: 'setReady', matchId: matchId });
    expect(ra.myReady).toBe(true);
    expect(rb.bothReady).toBe(true);

    // 4) 注入已知题目后，A 连续完成 N 局（B 不提交）
    setPuzzle(SOL4);
    asUser(A);
    for (var i = 0; i < N; i++) {
      var res = await pkSubmit({ matchId: matchId, grid: SOL4 });
      expect(res.ok).toBe(true);
      if (i < N - 1) expect(res.matchFinished).toBe(false);
    }
    var finalA = await pkState({ action: 'getMatch', matchId: matchId });
    expect(finalA.match.status).toBe('finished');
    expect(finalA.match.winnerSlot).toBe(0);

    // 5) 战绩应写入双方
    expect(mockStore.pk_records.length).toBe(2);
    var recA = mockStore.pk_records.find(function (r) { return r._openid === A; });
    var recB = mockStore.pk_records.find(function (r) { return r._openid === B; });
    expect(recA.result).toBe('win');
    expect(recB.result).toBe('lose');
    expect(recA.roundsDetail.length).toBe(N);
  });

  test('场景2：B 先完成全部局 → B 胜（独立推进，先到先赢）', async function () {
    var N = 1;
    asUser(A);
    var a = await pkMatch({ action: 'randomMatch', mode: '4x4', totalRounds: N });
    asUser(B);
    var b = await pkMatch({ action: 'randomMatch', mode: '4x4', totalRounds: N });
    var matchId = b.matchId;

    asUser(A); await pkState({ action: 'setReady', matchId: matchId });
    asUser(B); await pkState({ action: 'setReady', matchId: matchId });

    // 注入已知题目后，B 先提交
    setPuzzle(SOL4);
    asUser(B);
    var resB = await pkSubmit({ matchId: matchId, grid: SOL4 });
    expect(resB.matchFinished).toBe(true);
    expect(resB.winnerSlot).toBe(1);

    // A 再提交应被拒绝（对局已结束）
    asUser(A);
    var resA = await pkSubmit({ matchId: matchId, grid: SOL4 });
    expect(resA.ok).toBe(false);
    expect(resA.error).toContain('已结束');
  });

  test('场景3：认输应判对方获胜并结束', async function () {
    var N = 1;
    asUser(A);
    var a = await pkMatch({ action: 'randomMatch', mode: '4x4', totalRounds: N });
    asUser(B);
    var b = await pkMatch({ action: 'randomMatch', mode: '4x4', totalRounds: N });
    var matchId = b.matchId;

    // A 认输
    asUser(A);
    var res = await pkState({ action: 'surrender', matchId: matchId });
    expect(res.ok).toBe(true);
    expect(res.winnerSlot).toBe(1); // 对手 B 胜
    var m = await pkState({ action: 'getMatch', matchId: matchId });
    expect(m.match.status).toBe('finished');
  });

  test('场景4：房间号邀请流程（createRoom + joinRoom）', async function () {
    var N = 3;
    asUser(A);
    var created = await pkMatch({ action: 'createRoom', mode: '6x6', totalRounds: N });
    expect(created.ok).toBe(true);
    var code = created.roomCode;

    asUser(B);
    var joined = await pkMatch({ action: 'joinRoom', roomCode: code });
    expect(joined.ok).toBe(true);
    expect(joined.match.status).toBe('playing');
    expect(joined.match.rounds.length).toBe(N);
    expect(joined.match.mode).toBe('6x6');
  });

  test('场景5：并发提交安全——后到的提交不应重复结算', async function () {
    var N = 1;
    asUser(A);
    var a = await pkMatch({ action: 'randomMatch', mode: '4x4', totalRounds: N });
    asUser(B);
    var b = await pkMatch({ action: 'randomMatch', mode: '4x4', totalRounds: N });
    var matchId = b.matchId;
    asUser(A); await pkState({ action: 'setReady', matchId: matchId });
    asUser(B); await pkState({ action: 'setReady', matchId: matchId });

    // 注入已知题目后，几乎同时提交（模拟并发）
    setPuzzle(SOL4);
    asUser(A); var pA = pkSubmit({ matchId: matchId, grid: SOL4 });
    asUser(B); var pB = pkSubmit({ matchId: matchId, grid: SOL4 });
    var results = await Promise.all([pA, pB]);
    // 其中恰好一个完成结算
    var finishedCount = results.filter(function (r) { return r.matchFinished; }).length;
    expect(finishedCount).toBe(1);
    expect(mockStore.pk_records.length).toBe(2); // 仅一次结算写双方
    var m = await pkState({ action: 'getMatch', matchId: matchId });
    expect(m.match.status).toBe('finished');
  });
});
