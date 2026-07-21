// tests/unit/theme.test.js
// 白盒：主题切换工具（normal/soft/eye-care）的取值、写入与注入

const { makeWxMock, installWx } = require('../helpers/wxMock');

describe('utils/theme 主题切换', function () {
  var mock, theme, store;
  beforeEach(function () {
    jest.resetModules();
    mock = makeWxMock();
    mock.globalData = { colorMode: 'normal' };
    installWx(mock);
    store = require('../../utils/store');
    theme = require('../../utils/theme');
  });

  test('getColorMode 返回当前主题，缺省 normal', function () {
    expect(theme.getColorMode()).toBe('normal');
    store.setState('colorMode', 'soft');
    expect(theme.getColorMode()).toBe('soft');
  });

  test('setColorMode 仅接受合法值', function () {
    theme.setColorMode('soft');
    expect(store.getState('colorMode')).toBe('soft');
    theme.setColorMode('invalid'); // 不合法被忽略
    expect(store.getState('colorMode')).toBe('soft');
    theme.setColorMode('eye-care');
    expect(store.getState('colorMode')).toBe('eye-care');
  });

  test('injectTheme 将主题注入 page data', function () {
    var page = { setData: jest.fn() };
    store.setState('colorMode', 'eye-care');
    theme.injectTheme(page);
    expect(page.setData).toHaveBeenCalledWith({ colorMode: 'eye-care' });
  });
});
