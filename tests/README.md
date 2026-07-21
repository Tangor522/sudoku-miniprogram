# 数独小程序 - 测试说明

## 测试概览

本项目采用三层测试策略：

| 层级 | 范围 | 工具 | 状态 | 用例数 |
|---|---|---|---|---|
| 单元测试 | 核心算法 `utils/sudoku.js` | Jest | ✅ 全部通过 | 34 |
| 逻辑测试 | 云函数 `login` / `saveProgress` | Jest + mock | ✅ 全部通过 | 10 |
| 手动功能测试 | UI 流程、边界、异常 | 开发者工具 + 真机 | 📋 用例清单就绪 | 60+ |
| E2E 自动化 | 小程序完整流程 | miniprogram-automator | 📋 示例脚本就绪 | - |

**最新运行结果：3 套件 / 44 测试 / 全部通过 / 1.15s**

---

## 一、运行自动化测试

### 环境要求
- Node.js 16+（本项目用 managed node 22.22.2）

### 步骤

```bash
# 进入测试目录
cd sudoku-miniprogram/tests

# 首次需安装依赖（jest）
# Windows（用 managed node）:
"C:\Users\luozt\.workbuddy\binaries\node\versions\22.22.2\npm.cmd" install

# 运行全部测试
"C:\Users\luozt\.workbuddy\binaries\node\versions\22.22.2\node.exe" node_modules/jest/bin/jest.js --verbose

# 只跑核心算法测试
"C:\Users\luozt\.workbuddy\binaries\node\versions\22.22.2\node.exe" node_modules/jest/bin/jest.js sudoku --verbose

# 只跑云函数测试
"C:\Users\luozt\.workbuddy\binaries\node\versions\22.22.2\node.exe" node_modules/jest/bin/jest.js cloudfunctions --verbose
```

### 测试文件说明

```
tests/
├── package.json                          # jest 配置 + 依赖
├── __mocks__/
│   └── wx-server-sdk.js                  # 云开发 SDK 的 mock（通过 moduleNameMapper 映射）
├── sudoku.test.js                        # 核心算法单元测试（34 个）
├── cloudfunctions/
│   ├── login.logic.test.js               # login 云函数逻辑测试（4 个）
│   └── saveProgress.logic.test.js        # saveProgress 云函数逻辑测试（6 个）
├── e2e/
│   └── miniprogram-automator.demo.js     # E2E 自动化示例脚本
└── 测试用例清单.md                        # 手动测试用例（60+ 条）
```

---

## 二、单元测试覆盖范围

### `utils/sudoku.js`（34 个测试）

**generate4x4Puzzle（9 个）**
- ✅ 生成 4x4 维度
- ✅ 非空格数字在 1-4 范围
- ✅ 各关卡段空格数正确（7/8/9/10/11/12）
- ✅ 随机性（多次生成结果不完全相同）

**generate6x6Puzzle（5 个）**
- ✅ 生成 6x6 维度
- ✅ 非空格数字在 1-6 范围
- ✅ 各关卡段空格数正确（14/19）
- ✅ 空格数不超过总格数 36

**toCellGrid（3 个）**
- ✅ 非零值标记 fixed=true
- ✅ 保持原矩阵维度
- ✅ 不修改原数组（纯函数）

**check4x4（8 个）**
- ✅ 完整且正确 → isComplete=true, hasError=false
- ✅ 行重复 → 检测到错误并标记对应单元格
- ✅ 列重复 → 检测到错误
- ✅ 宫格重复（2x2）→ 检测到错误
- ✅ 有空格 → isComplete=false
- ✅ 有空格但无冲突 → hasError=false
- ✅ 不完整且有冲突 → 两者都报
- ✅ 全空格 → 不报错但不完整

**check6x6（6 个）**
- ✅ 完整且正确
- ✅ 行/列/宫格（2行3列）重复检测
- ✅ 有空格、不完整且有冲突

**集成场景（3 个）**
- ✅ 4x4 生成后填回正确解能通过校验
- ✅ 6x6 生成后填回正确解能通过校验
- ✅ 生成的题目空格数符合预期且不破坏宫格结构

---

## 三、云函数逻辑测试覆盖

### `cloudfunctions/login`（4 个）
- ✅ 首次登录返回 isNew=true 并创建记录
- ✅ 第二次登录返回 isNew=false
- ✅ update=true 更新昵称和头像
- ✅ 更新后再登录返回最新资料

### `cloudfunctions/saveProgress`（6 个）
- ✅ 首次保存某关新增记录
- ✅ 更快的成绩更新（最佳成绩逻辑）
- ✅ 更慢的成绩不更新
- ✅ 不同关卡分别记录
- ✅ 不同模式同关卡分别记录
- ✅ action=list 返回指定模式记录

> 云函数测试通过 mock `wx-server-sdk` 实现，不依赖真实云环境。mock 模拟了数据库集合的 where/get/add/update 操作及 `_openid` 自动注入行为。

---

## 四、手动测试

详见 `测试用例清单.md`，包含 8 大类 60+ 条用例：

1. **登录流程**（9 条）：本地/云开发双模式、资料补全、登录态保持
2. **首页**（11 条）：配色切换、模式入口、退出登录
3. **四宫格**（16 条）：选格、填数、提交、关卡进阶、100关庆祝
4. **六宫格**（6 条）：与四宫格对称
5. **统计页**（7 条）：记录展示、模式切换、云端同步
6. **边界与异常**（10 条）：第1/100/101关、计时器后台、清缓存、网络异常
7. **兼容性**（7 条）：iOS/Android、大小屏、基础库版本
8. **性能观察**（4 条）：渲染速度、setData、冷启动

---

## 五、E2E 自动化（进阶）

`e2e/miniprogram-automator.demo.js` 提供了基于 `miniprogram-automator` 的完整流程示例：

启动小程序 → 模拟登录 → 进入四宫格 → 选格填数 → 提交 → 校验弹窗

**使用前准备**：
1. `npm install -g miniprogram-automator`
2. 微信开发者工具：设置 → 安全设置 → 开启服务端口
3. 修改脚本中 `CLI_PATH` 为你的开发者工具 cli.bat 实际路径
4. `project.config.json` 填入真实 AppID

**运行**：
```bash
node tests/e2e/miniprogram-automator.demo.js
```

> 该脚本为演示性质，可在此基础上扩展为完整的 E2E 测试套件。

---

## 六、测试结论

- **核心算法**：逻辑正确，生成、挖空、校验均符合预期，随机性正常
- **云函数**：login 注册/登录/更新流程正确，saveProgress 最佳成绩逻辑正确
- **已知风险**：
  - `nickname input` 在开发者工具模拟器表现异常，需真机验证（手动测试 C-01）
  - 计时器后台行为依赖小程序生命周期，需真机验证（手动测试 E-05）
  - 云开发冷启动延迟需实际观测（手动测试 P-03）
- **建议**：上线前至少完成手动测试用例清单中 L/G4/G6/S/E 系列的核心路径
