// tests/unit/cloud.test.js
// 白盒：云开发封装（isReady/login/updateProfile/uploadAvatar/saveProgress/getStats/getRanking）

const { makeWxMock, installWx } = require('../helpers/wxMock');

describe('utils/cloud 云开发封装', function () {
  var mock, cloud;
  beforeEach(function () {
    jest.resetModules();
    mock = makeWxMock();
    mock.globalData = { cloudReady: false };
    installWx(mock);
    cloud = require('../../utils/cloud');
  });

  test('isReady 反映 globalData.cloudReady', function () {
    expect(cloud.isReady()).toBe(false);
    mock.globalData.cloudReady = true;
    expect(cloud.isReady()).toBe(true);
  });

  test('login 调用 login 云函数并返回 result', async function () {
    mock.wx.cloud.callFunctionImpl = function () {
      return Promise.resolve({ result: { ok: true, openid: 'o1' } });
    };
    var res = await cloud.login();
    expect(mock.calls.find(function (c) { return c.type === 'callFunction'; }).name).toBe('login');
    expect(res.result.openid).toBe('o1');
  });

  test('updateProfile 传 nickName/avatarFileID/update', async function () {
    var captured;
    mock.wx.cloud.callFunctionImpl = function (opt) { captured = opt; return Promise.resolve({ result: { ok: true } }); };
    await cloud.updateProfile('Tom', 'cloud://a.png');
    expect(captured.name).toBe('login');
    expect(captured.data.nickName).toBe('Tom');
    expect(captured.data.avatarFileID).toBe('cloud://a.png');
    expect(captured.data.update).toBe(true);
  });

  test('uploadAvatar 调用 uploadFile 并返回 fileID', async function () {
    var res = await cloud.uploadAvatar('/tmp/a.png');
    expect(mock.calls.find(function (c) { return c.type === 'uploadFile'; })).toBeDefined();
    expect(res.fileID).toBe('cloud://test.png');
  });

  test('saveProgress 调用 saveProgress 云函数且字段正确', async function () {
    var captured;
    mock.wx.cloud.callFunctionImpl = function (opt) { captured = opt; return Promise.resolve({ result: { ok: true } }); };
    await cloud.saveProgress('4x4', 3, 120);
    expect(captured.name).toBe('saveProgress');
    expect(captured.data.mode).toBe('4x4');
    expect(captured.data.level).toBe(3);
    expect(captured.data.usedTime).toBe(120);
    expect(typeof captured.data.completedAt).toBe('number');
  });

  test('getStats 返回 res.result.list', async function () {
    mock.wx.cloud.callFunctionImpl = function () { return Promise.resolve({ result: { list: [{ level: 1 }] } }); };
    var list = await cloud.getStats('4x4');
    expect(list).toEqual([{ level: 1 }]);
  });

  test('getRanking 返回 res.result', async function () {
    mock.wx.cloud.callFunctionImpl = function () { return Promise.resolve({ result: { myRank: 2 } }); };
    var r = await cloud.getRanking();
    expect(r.myRank).toBe(2);
  });
});
