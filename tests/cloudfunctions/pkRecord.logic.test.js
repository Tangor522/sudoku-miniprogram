// tests/cloudfunctions/pkRecord.logic.test.js
// 云函数 pkRecord 逻辑测试：战绩列表、统计聚合

var mockHelper = require('../helpers/cloudDbMock');
var mockStore = mockHelper.makeStore();

jest.mock('wx-server-sdk', () => mockHelper.buildMock(mockStore));

const cloud = require('wx-server-sdk');
const handler = require('../../cloudfunctions/pkRecord/index').main;

function asUser(openid) {
  cloud.getWXContext = function () { return { OPENID: openid, APPID: 'x' }; };
}

function rec(openid, result, mode, totalTime, finishedAt) {
  return {
    _openid: openid, matchId: 'm', mode: mode, totalRounds: 1, result: result,
    opponentOpenid: 'opp', opponentNickName: '对手', opponentAvatarUrl: '',
    totalTime: totalTime, roundsDetail: [], matchType: 'random', finishedAt: finishedAt
  };
}

describe('云函数 pkRecord', function () {
  beforeEach(function () {
    cloud.__reset();
    cloud.getWXContext = function () { return { OPENID: 'test-openid-001', APPID: 'test-appid' }; };
  });

  test('action=list 应返回本人战绩（按时间倒序）', async function () {
    asUser('test-openid-001');
    mockStore.pk_records.push(rec('test-openid-001', 'win', '4x4', 1000, 1000));
    mockStore.pk_records.push(rec('test-openid-001', 'lose', '6x6', 2000, 2000));
    mockStore.pk_records.push(rec('other', 'win', '4x4', 999, 1500)); // 他人，不应返回
    var res = await handler({ action: 'list', limit: 20, skip: 0 });
    expect(res.ok).toBe(true);
    expect(res.list.length).toBe(2);
    expect(res.list[0].finishedAt).toBe(2000); // 倒序
  });

  test('action=stats 应正确聚合胜负与胜率', async function () {
    asUser('test-openid-001');
    mockStore.pk_records.push(rec('test-openid-001', 'win', '4x4', 1000, 1000));
    mockStore.pk_records.push(rec('test-openid-001', 'win', '6x6', 2000, 2000));
    mockStore.pk_records.push(rec('test-openid-001', 'lose', '4x4', 1500, 1500));
    mockStore.pk_records.push(rec('test-openid-001', 'draw', '6x6', 1200, 1200));
    var res = await handler({ action: 'stats' });
    expect(res.ok).toBe(true);
    var s = res.stats;
    expect(s.total).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.draws).toBe(1);
    expect(s.mode4x4).toBe(2);
    expect(s.mode6x6).toBe(2);
    expect(s.winRate).toBe(50);
    expect(s.totalTime).toBe(1000 + 2000 + 1500 + 1200);
    expect(s.avgTime).toBe(Math.round((1000 + 2000 + 1500 + 1200) / 4));
  });

  test('未知 action 应返回错误', async function () {
    var res = await handler({ action: 'fly' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('未知 action');
  });
});
