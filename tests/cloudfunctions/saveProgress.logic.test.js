// tests/cloudfunctions/saveProgress.logic.test.js
// 云函数 saveProgress 逻辑测试（mock wx-server-sdk）

jest.mock('wx-server-sdk', () => {
  const progress = []; // 模拟 progress 集合
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    database: () => ({
      collection: (name) => ({
        where: (cond) => ({
          get: async () => {
            let list = progress.filter(function (r) {
              return (!cond._openid || r._openid === cond._openid) &&
                     (!cond.mode || r.mode === cond.mode) &&
                     (!cond.level || r.level === cond.level);
            });
            return { data: list };
          },
          update: async (opt) => {
            progress.forEach(function (r) {
              if ((!cond._openid || r._openid === cond._openid) &&
                  r.mode === cond.mode && r.level === cond.level) {
                Object.assign(r, opt.data);
              }
            });
            return { stats: { updated: 1 } };
          },
          orderBy: function () { return this; },
        }),
        add: async (opt) => {
          const id = 'id-' + Date.now();
          progress.push(Object.assign({ _id: id }, opt.data));
          return { _id: id };
        },
      }),
    }),
    getWXContext: () => ({ OPENID: 'test-openid-001', APPID: 'test-appid' }),
    __progress: progress,
  };
});

const cloud = require('wx-server-sdk');
const handler = require('../../cloudfunctions/saveProgress/index').main;

describe('云函数 saveProgress', function () {

  beforeEach(function () {
    cloud.__progress.length = 0;
  });

  test('首次保存某关应新增记录', async function () {
    const res = await handler({ mode: '4x4', level: 1, usedTime: 60, completedAt: Date.now() });
    expect(res.ok).toBe(true);
    expect(cloud.__progress.length).toBe(1);
    expect(cloud.__progress[0].usedTime).toBe(60);
  });

  test('更快的成绩应更新', async function () {
    await handler({ mode: '4x4', level: 1, usedTime: 60, completedAt: 1000 });
    await handler({ mode: '4x4', level: 1, usedTime: 45, completedAt: 2000 });
    expect(cloud.__progress.length).toBe(1);
    expect(cloud.__progress[0].usedTime).toBe(45);
  });

  test('更慢的成绩不应更新', async function () {
    await handler({ mode: '4x4', level: 1, usedTime: 30, completedAt: 1000 });
    await handler({ mode: '4x4', level: 1, usedTime: 50, completedAt: 2000 });
    expect(cloud.__progress[0].usedTime).toBe(30);
  });

  test('不同关卡应分别记录', async function () {
    await handler({ mode: '4x4', level: 1, usedTime: 30, completedAt: 1000 });
    await handler({ mode: '4x4', level: 2, usedTime: 40, completedAt: 2000 });
    expect(cloud.__progress.length).toBe(2);
  });

  test('不同模式同关卡应分别记录', async function () {
    await handler({ mode: '4x4', level: 1, usedTime: 30, completedAt: 1000 });
    await handler({ mode: '6x6', level: 1, usedTime: 50, completedAt: 2000 });
    expect(cloud.__progress.length).toBe(2);
  });

  test('action=list 应返回指定模式记录', async function () {
    await handler({ mode: '4x4', level: 1, usedTime: 30, completedAt: 1000 });
    await handler({ mode: '4x4', level: 3, usedTime: 60, completedAt: 2000 });
    await handler({ mode: '6x6', level: 1, usedTime: 90, completedAt: 3000 });
    const res = await handler({ action: 'list', mode: '4x4' });
    expect(res.list.length).toBe(2);
  });
});
