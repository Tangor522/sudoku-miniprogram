// tests/unit/auth.test.js
// 白盒：登录鉴权（requireLogin 跳转 + logout 清空状态）

const { makeWxMock, installWx } = require('../helpers/wxMock');

describe('utils/auth 登录鉴权', function () {
  var mock, auth, store;
  beforeEach(function () {
    jest.resetModules();
    mock = makeWxMock();
    mock.globalData = { user: null };
    installWx(mock);
    store = require('../../utils/store');
    auth = require('../../utils/auth');
  });

  test('requireLogin 未登录 → 跳转登录页并返回 false', function () {
    var ok = auth.requireLogin();
    expect(ok).toBe(false);
    var red = mock.calls.find(function (c) { return c.type === 'redirectTo'; });
    expect(red.url).toBe('/pages/login/login');
  });

  test('requireLogin 已登录 → 返回 true', function () {
    store.setState('user', { openid: 'o1' });
    expect(auth.requireLogin()).toBe(true);
  });

  test('logout 清空登录态', function () {
    store.setState('user', { openid: 'o1' });
    auth.markWechatLogin();
    auth.logout();
    expect(store.getState('user')).toBeNull();
    expect(mock.storage.authMode).toBeUndefined();
  });

  test('游客模式不伪造用户，但允许进入单人体验', function () {
    auth.enterGuest();
    expect(store.getState('user')).toBeNull();
    expect(auth.isGuest()).toBe(true);
    expect(auth.hasAccessChoice()).toBe(true);
    expect(mock.storage.authMode).toBe('guest');
  });

  test('微信登录标记会退出游客模式', function () {
    auth.enterGuest();
    auth.markWechatLogin();
    store.setState('user', { openid: 'o1' });
    expect(auth.isGuest()).toBe(false);
    expect(mock.storage.authMode).toBe('wechat');
  });
});
