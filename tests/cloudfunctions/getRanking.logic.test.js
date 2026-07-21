// tests/cloudfunctions/getRanking.logic.test.js
// 云函数 getRanking 逻辑测试：聚合统计、排序规则、昵称补全、myRank

var mockHelper = require('../helpers/cloudDbMock');
var mockStore = mockHelper.makeStore();

jest.mock('wx-server-sdk', () => mockHelper.buildMock(mockStore));

const cloud = require('wx-server-sdk');
const handler = require('../../cloudfunctions/getRanking/index').main;

describe('云函数 getRanking', function () {
  beforeEach(function () {
    cloud.__reset();
    cloud.getWXContext = function () { return { OPENID: 'test-openid-001', APPID: 'test-appid' }; };
  });

  test('无数据时返回空列表与 null myRank', async function () {
    var res = await handler({});
    expect(res.list).toEqual([]);
    expect(res.myRank).toBeNull();
  });

  test('应按总关数降序、总用时升序排序', async function () {
    // 玩家A：2关，总用时 100s
    mockStore.progress.push({ _openid: 'A', mode: '4x4', level: 1, usedTime: 60 });
    mockStore.progress.push({ _openid: 'A', mode: '4x4', level: 2, usedTime: 40 });
    // 玩家B：3关，总用时 300s（关数最多，应排第一）
    mockStore.progress.push({ _openid: 'B', mode: '4x4', level: 1, usedTime: 100 });
    mockStore.progress.push({ _openid: 'B', mode: '4x4', level: 2, usedTime: 100 });
    mockStore.progress.push({ _openid: 'B', mode: '4x4', level: 3, usedTime: 100 });
    // 玩家C：2关，总用时 50s（与A关数相同但更快，应排在A前面）
    mockStore.progress.push({ _openid: 'C', mode: '4x4', level: 1, usedTime: 30 });
    mockStore.progress.push({ _openid: 'C', mode: '4x4', level: 2, usedTime: 20 });

    // 调整 getWXContext 的 openid 以便断言 myRank（B 是当前调用者）
    cloud.getWXContext = function () { return { OPENID: 'B', APPID: 'x' }; };

    var res = await handler({});
    expect(res.list.length).toBe(3);
    expect(res.list[0].openid).toBe('B');  // 关数最多
    expect(res.list[1].openid).toBe('C');  // 同关数，用时更短
    expect(res.list[2].openid).toBe('A');
    expect(res.list[0].totalLevels).toBe(3);
    expect(res.list[1].totalTime).toBe(50);
    expect(res.myRank.openid).toBe('B');
  });

  test('users 缺失昵称应显示「匿名玩家」', async function () {
    mockStore.progress.push({ _openid: 'X', mode: '4x4', level: 1, usedTime: 10 });
    // 不写入 users 集合
    var res = await handler({});
    expect(res.list[0].nickName).toBe('匿名玩家');
  });

  test('应正确 join 出用户昵称', async function () {
    mockStore.progress.push({ _openid: 'Y', mode: '4x4', level: 1, usedTime: 10 });
    mockStore.users.push({ _openid: 'Y', nickName: '老王', avatarUrl: 'cloud://y.png' });
    var res = await handler({});
    expect(res.list[0].nickName).toBe('老王');
    expect(res.list[0].avatarUrl).toBe('cloud://y.png');
  });
});
