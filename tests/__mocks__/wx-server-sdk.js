// tests/__mocks__/wx-server-sdk.js
// wx-server-sdk 的本地 mock，供云函数逻辑测试使用
// 通过 jest moduleNameMapper 映射 'wx-server-sdk' → 此文件

// 共享存储（不同云函数测试间隔离：每个测试文件 beforeEach 清空）
var _store = {};
var _progress = [];

module.exports = {
  init: function () {},
  DYNAMIC_CURRENT_ENV: 'test-env',
  database: function () {
    return {
      collection: function (name) {
        if (name === 'users') {
          return {
            where: function (cond) {
              return {
                get: async function () {
                  if (cond._openid && _store[cond._openid]) {
                    return { data: [_store[cond._openid]] };
                  }
                  return { data: [] };
                },
                update: async function (opt) {
                  if (_store[cond._openid]) {
                    Object.assign(_store[cond._openid], opt.data);
                  }
                  return { stats: { updated: 1 } };
                }
              };
            },
            add: async function (opt) {
              var id = 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
              _store[opt.data._openid || 'default'] = opt.data;
              return { _id: id };
            }
          };
        }
        if (name === 'progress') {
          return {
            where: function (cond) {
              return {
                get: async function () {
                  var list = _progress.filter(function (r) {
                    return (!cond._openid || r._openid === cond._openid) &&
                           (!cond.mode || r.mode === cond.mode) &&
                           (!cond.level || r.level === cond.level);
                  });
                  return { data: list };
                },
                update: async function (opt) {
                  _progress.forEach(function (r) {
                    if ((!cond._openid || r._openid === cond._openid) &&
                        r.mode === cond.mode && r.level === cond.level) {
                      Object.assign(r, opt.data);
                    }
                  });
                  return { stats: { updated: 1 } };
                },
                orderBy: function () { return this; }
              };
            },
            add: async function (opt) {
              var id = 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
              _progress.push(Object.assign({ _id: id }, opt.data));
              return { _id: id };
            }
          };
        }
        return {};
      }
    };
  },
  getWXContext: function () {
    return { OPENID: 'test-openid-001', APPID: 'test-appid' };
  },
  // 暴露给测试用
  __store: _store,
  __progress: _progress,
  __reset: function () {
    Object.keys(_store).forEach(function (k) { delete _store[k]; });
    _progress.length = 0;
  }
};
