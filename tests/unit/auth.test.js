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
    expect(red.url).toBe('/pages/login/login?from=home');
  });

  test('requireLogin 保留目标功能，登录后可正确回跳', function () {
    expect(auth.requireLogin('pk')).toBe(false);
    var red = mock.calls.find(function (c) { return c.type === 'redirectTo'; });
    expect(red.url).toBe('/pages/login/login?from=pk');
    expect(auth.loginUrl('ranking')).toBe('/pages/login/login?from=ranking');
    expect(auth.loginUrl('game9x9')).toBe('/pages/login/login?from=game9x9');
    expect(auth.loginUrl('unknown')).toBe('/pages/login/login?from=home');
  });

  test('requireLogin 已登录 → 返回 true', function () {
    store.setState('user', { openid: 'o1' });
    expect(auth.requireLogin()).toBe(true);
  });

  test('logout 清空登录态', function () {
    store.setState('user', { openid: 'o1' });
    auth.logout();
    expect(store.getState('user')).toBeNull();
  });
});
