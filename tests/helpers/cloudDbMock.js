// tests/helpers/cloudDbMock.js
// 内存版云数据库 mock，供云函数逻辑测试使用。
// 支持：collection.doc().get/update、collection.where().get/update/orderBy/skip/limit、
//       collection.add、aggregate(group/sort/limit/end)、db.command(.set/.in)、runTransaction。

function makeStore() {
  return {
    users: [],      // users 集合
    progress: [],   // progress 集合
    matches: [],    // matches 集合
    pk_records: []  // pk_records 集合
  };
}

// 命令对象
function makeCommand() {
  return {
    set: function (val) { return { $set: val }; },
    in: function (arr) { return { $in: arr }; },
    aggregate: {
      sum: function (expr) { return { $sum: expr }; }
    }
  };
}

// 在对象上按点路径赋值（如 'playerStates.0.ready'）
function setByPath(obj, path, value) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    var key = parts[i];
    if (cur[key] === undefined || cur[key] === null) cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

// 按一个点路径取值
function getByPath(obj, path) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

// where 条件匹配（支持等值、{$in}）
function matchCond(doc, cond) {
  if (!cond) return true;
  for (var k in cond) {
    var cv = cond[k];
    var dv = doc[k];
    if (cv && typeof cv === 'object' && cv.$in) {
      if (cv.$in.indexOf(dv) === -1) return false;
    } else if (cv !== dv) {
      return false;
    }
  }
  return true;
}

function applyUpdate(doc, data) {
  for (var k in data) {
    var v = data[k];
    if (v && typeof v === 'object' && v.$set !== undefined) {
      setByPath(doc, k, v.$set);
    } else if (k.indexOf('.') > -1) {
      setByPath(doc, k, v);
    } else {
      doc[k] = v;
    }
  }
}

function genId(prefix) {
  return (prefix || 'id') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

function buildMock(store) {
  var command = makeCommand();

  function collectionApi(arr) {
    // 链式查询：where / orderBy / skip / limit / field 真实生效
    function makeQuery(cond) {
      var state = { cond: cond || null, orderBySpec: null, skipN: 0, limitN: null };
      function apply() {
        var list = arr.filter(function (d) { return matchCond(d, state.cond); });
        if (state.orderBySpec) {
          var fields = Object.keys(state.orderBySpec);
          list.sort(function (a, b) {
            for (var i = 0; i < fields.length; i++) {
              var f = fields[i];
              var dir = state.orderBySpec[f];
              if (a[f] !== b[f]) return dir === -1 ? b[f] - a[f] : a[f] - b[f];
            }
            return 0;
          });
        }
        if (state.skipN) list = list.slice(state.skipN);
        if (state.limitN != null) list = list.slice(0, state.limitN);
        return list;
      }
      return {
        get: async function () { return { data: apply() }; },
        update: async function (opt) {
          var list = apply();
          list.forEach(function (d) { applyUpdate(d, opt.data); });
          return { stats: { updated: list.length } };
        },
        orderBy: function (field, dir) {
          state.orderBySpec = {};
          state.orderBySpec[field] = dir === 'desc' ? -1 : 1;
          return this;
        },
        skip: function (n) { state.skipN = n; return this; },
        limit: function (n) { state.limitN = n; return this; },
        field: function () { return this; }
      };
    }

    return {
      doc: function (id) {
        return {
          get: async function () {
            var doc = arr.find(function (d) { return d._id === id; });
            return { data: doc || null };
          },
          update: async function (opt) {
            var doc = arr.find(function (d) { return d._id === id; });
            if (!doc) return { stats: { updated: 0 } };
            applyUpdate(doc, opt.data);
            return { stats: { updated: 1 } };
          }
        };
      },
      where: function (cond) { return makeQuery(cond); },
      orderBy: function (field, dir) { return makeQuery(null).orderBy(field, dir); },
      skip: function (n) { return makeQuery(null).skip(n); },
      limit: function (n) { return makeQuery(null).limit(n); },
      field: function () { return makeQuery(null).field(); },
      get: async function () { return { data: arr.slice() }; },
      add: async function (opt) {
        var id = genId('rec');
        var rec = Object.assign({ _id: id }, opt.data);
        arr.push(rec);
        return { _id: id };
      },
      aggregate: function () {
        var pipeline = [];
        return {
          group: function (spec) {
            pipeline.push({ op: 'group', spec: spec });
            return this;
          },
          sort: function (spec) {
            pipeline.push({ op: 'sort', spec: spec });
            return this;
          },
          limit: function (n) {
            pipeline.push({ op: 'limit', n: n });
            return this;
          },
          end: async function () {
            var groups = {};
            var order = [];
            var groupSpec = pipeline.find(function (p) { return p.op === 'group'; }).spec;
            arr.forEach(function (d) {
              var key;
              if (typeof groupSpec._id === 'string' && groupSpec._id.charAt(0) === '$') {
                key = getByPath(d, groupSpec._id.slice(1));
              } else {
                key = groupSpec._id;
              }
              if (!groups[key]) { groups[key] = {}; order.push(key); }
              for (var acc in groupSpec) {
                if (acc === '_id') continue;
                var expr = groupSpec[acc].$sum;
                if (!groups[key][acc]) groups[key][acc] = 0;
                if (expr === 1) groups[key][acc] += 1;
                else if (typeof expr === 'string' && expr.charAt(0) === '$') {
                  groups[key][acc] += getByPath(d, expr.slice(1)) || 0;
                }
              }
            });
            var list = order.map(function (k) {
              var entry = { _id: k };
              for (var acc in groupSpec) {
                if (acc === '_id') continue;
                entry[acc] = groups[k][acc];
              }
              return entry;
            });
            var sortSpec = pipeline.find(function (p) { return p.op === 'sort'; });
            if (sortSpec) {
              var fields = Object.keys(sortSpec.spec);
              list.sort(function (a, b) {
                for (var i = 0; i < fields.length; i++) {
                  var f = fields[i];
                  var dir = sortSpec.spec[f];
                  if (a[f] !== b[f]) return dir === -1 ? b[f] - a[f] : a[f] - b[f];
                }
                return 0;
              });
            }
            var limitSpec = pipeline.find(function (p) { return p.op === 'limit'; });
            if (limitSpec) list = list.slice(0, limitSpec.n);
            return { list: list };
          }
        };
      }
    };
  }

  function makeDb() {
    return {
      collection: function (name) {
        var arr = store[name] || (store[name] = []);
        return collectionApi(arr);
      },
      command: command,
      runTransaction: async function (fn) {
        var transaction = {
          collection: function (name) {
            var arr = store[name] || (store[name] = []);
            return collectionApi(arr);
          }
        };
        return await fn(transaction);
      }
    };
  }

  return {
    init: function () {},
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: makeDb,
    getWXContext: function () {
      return { OPENID: 'test-openid-001', APPID: 'test-appid' };
    },
    __store: store,
    __reset: function () {
      store.users.length = 0;
      store.progress.length = 0;
      store.matches.length = 0;
      store.pk_records.length = 0;
    }
  };
}

module.exports = { makeStore: makeStore, buildMock: buildMock };
