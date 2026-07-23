// app.js - 小程序入口
App({
  globalData: {
    user: null,            // { openid, nickName, avatarUrl } 登录后填充
    guestMode: false,      // 新用户主动选择游客体验后为 true
    colorMode: 'normal',   // 'normal' | 'soft' | 'eye-care'
    cloudReady: false,     // 云开发是否初始化完成
    // 云环境 ID：开通云开发后替换为真实环境 ID（见 README.md）
    // 保持 'your-env-id' 时将自动降级为本地存储模式，小程序仍可正常运行
    cloudEnv: 'cloud1-d7g923wuw561b7bb6'
  },

  onLaunch() {
    // 1. 云开发初始化（仅当配置了真实云环境 ID 时）
    if (wx.cloud && this.globalData.cloudEnv !== 'your-env-id') {
      try {
        wx.cloud.init({
          env: this.globalData.cloudEnv,
          traceUser: true
        });
        this.globalData.cloudReady = true;
        console.log('[云开发] 初始化成功');
      } catch (e) {
        console.warn('[云开发] 初始化失败，降级本地存储', e);
      }
    } else {
      console.log('[云开发] 未配置环境 ID，使用本地存储模式');
    }

    // 2. 读取本地缓存的登录态与主题
    const cachedUser = wx.getStorageSync('currentUser');
    if (cachedUser) this.globalData.user = cachedUser;
    this.globalData.guestMode = !cachedUser && wx.getStorageSync('authMode') === 'guest';

    const cachedTheme = wx.getStorageSync('colorMode');
    if (cachedTheme && ['normal', 'soft', 'eye-care'].indexOf(cachedTheme) !== -1) {
      this.globalData.colorMode = cachedTheme;
    }
  }
});
