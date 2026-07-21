// tests/helpers/wxMock.js
// 为依赖 wx / getApp 的 util 提供可控 mock（白盒单元测试用）

function makeWxMock() {
  var storage = {};
  var calls = [];
  var wx = {
    getStorageSync: function (k) { return storage[k]; },
    setStorageSync: function (k, v) { storage[k] = v; },
    removeStorageSync: function (k) { delete storage[k]; },
    redirectTo: function (o) { calls.push({ type: 'redirectTo', url: o.url }); },
    navigateBack: function () { calls.push({ type: 'navigateBack' }); },
    showToast: function (o) { calls.push({ type: 'showToast', title: o.title }); },
    showModal: function () { calls.push({ type: 'showModal' }); },
    showLoading: function () {},
    hideLoading: function () {},
    // 云函数调用：默认成功，可被测试覆盖 cloud.callFunctionImpl
    cloud: {
      callFunction: function (opt) {
        calls.push({ type: 'callFunction', name: opt.name, data: opt.data });
        if (wx.cloud.callFunctionImpl) return wx.cloud.callFunctionImpl(opt);
        return Promise.resolve({ result: { ok: true } });
      },
      uploadFile: function () {
        calls.push({ type: 'uploadFile' });
        return Promise.resolve({ fileID: 'cloud://test.png' });
      }
    }
  };
  return { wx: wx, storage: storage, calls: calls };
}

function installWx(mock) {
  global.wx = mock.wx;
  global.getApp = function () { return { globalData: mock.globalData }; };
  if (!mock.globalData) mock.globalData = {};
  // 每次 install 都重置 globalData 引用
  global.getApp = function () { return { globalData: mock.globalData }; };
}

module.exports = { makeWxMock: makeWxMock, installWx: installWx };
