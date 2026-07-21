// tests/cloudfunctions/login.logic.test.js
// 云函数 login 逻辑测试：首登注册、老用户识别、资料更新、_openid 写入

var mockHelper = require('../helpers/cloudDbMock');
var mockStore = mockHelper.makeStore();

jest.mock('wx-server-sdk', () => mockHelper.buildMock(mockStore));

const cloud = require('wx-server-sdk');
const handler = require('../../cloudfunctions/login/index').main;

describe('云函数 login', function () {
  beforeEach(function () { cloud.__reset(); });

  test('首次进入应注册并返回 isNew=true', async function () {
    var res = await handler({});
    expect(res.isNew).toBe(true);
    expect(res.openid).toBe('test-openid-001');
    expect(cloud.__store.users.length).toBe(1);
    // 关键：云函数 add 必须手动写入 _openid，否则排行榜查不到
    expect(cloud.__store.users[0]._openid).toBe('test-openid-001');
  });

  test('再次进入应识别为老用户 isNew=false', async function () {
    await handler({});
    var res = await handler({});
    expect(res.isNew).toBe(false);
    // 不应重复注册
    expect(cloud.__store.users.length).toBe(1);
  });

  test('update=true 应更新昵称与头像', async function () {
    await handler({});
    var res = await handler({ nickName: '小明', avatarFileID: 'cloud://abc.png', update: true });
    expect(res.nickName).toBe('小明');
    expect(res.avatarUrl).toBe('cloud://abc.png');
    var u = cloud.__store.users[0];
    expect(u.nickName).toBe('小明');
    expect(u.avatarUrl).toBe('cloud://abc.png');
  });

  test('老用户带昵称直接返回昵称，不弹资料补全', async function () {
    await handler({}); // 先注册
    await handler({ nickName: '阿强', avatarFileID: '', update: true });
    var res = await handler({});
    expect(res.isNew).toBe(false);
    expect(res.nickName).toBe('阿强');
  });
});
