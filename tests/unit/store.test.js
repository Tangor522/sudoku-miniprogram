// tests/unit/store.test.js
// 白盒：全局状态管理（globalData 封装 + 发布订阅），跨 page 同步与本地缓存同步

const { makeWxMock, installWx } = require('../helpers/wxMock');

describe('utils/store 全局状态管理', function () {
  var mock, store;
  beforeEach(function () {
    jest.resetModules();
    mock = makeWxMock();
    mock.globalData = { user: null, colorMode: 'normal' };
    installWx(mock);
    store = require('../../utils/store');
    jest.spyOn(console, 'error').mockImplementation(function () {});
  });
  afterEach(function () {
    jest.restoreAllMocks();
  });

  test('getState / setState 读写 globalData', function () {
    expect(store.getState('user')).toBeNull();
    var u = { openid: 'o1' };
    store.setState('user', u);
    expect(store.getState('user')).toBe(u);
  });

  test('setState user 同步到本地缓存，null 时移除', function () {
    var u = { openid: 'o1' };
    store.setState('user', u);
    expect(mock.storage['currentUser']).toBe(u);
    store.setState('user', null);
    expect(mock.storage['currentUser']).toBeUndefined();
  });

  test('setState colorMode 同步到本地缓存', function () {
    store.setState('colorMode', 'eye-care');
    expect(mock.storage['colorMode']).toBe('eye-care');
  });

  test('subscribe 收到更新通知，unsubscribe 后不再收到', function () {
    var fn = jest.fn();
    var unsub = store.subscribe('colorMode', fn);
    store.setState('colorMode', 'soft');
    expect(fn).toHaveBeenCalledWith('soft');
    unsub();
    store.setState('colorMode', 'eye-care');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('多个订阅者均收到通知', function () {
    var a = jest.fn(), b = jest.fn();
    store.subscribe('user', a);
    store.subscribe('user', b);
    store.setState('user', { openid: 'x' });
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  test('某订阅者抛错不影响其他订阅者', function () {
    var a = jest.fn();
    var b = jest.fn(function () { throw new Error('boom'); });
    store.subscribe('user', b);
    store.subscribe('user', a);
    store.setState('user', { openid: 'x' });
    expect(a).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
