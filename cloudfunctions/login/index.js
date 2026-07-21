// cloudfunctions/login/index.js
// 登录云函数：换 openid、首次注册、更新资料
// 云开发环境下 openid 由 getWXContext 自动注入，免手动 code2Session

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { nickName, avatarFileID, update } = event;
  const col = db.collection('users');

  // 更新资料（昵称、头像）
  if (update) {
    await col.where({ _openid: openid }).update({
      data: { nickName: nickName, avatarUrl: avatarFileID }
    });
    return { openid, nickName, avatarUrl: avatarFileID };
  }

  // 查询用户是否已存在
  const { data } = await col.where({ _openid: openid }).get();
  if (data.length) {
    return {
      openid,
      isNew: false,
      nickName: data[0].nickName || '',
      avatarUrl: data[0].avatarUrl || ''
    };
  }

  // 首次注册（云函数 add 不会自动注入 _openid，需手动写入）
  await col.add({
    data: { _openid: openid, nickName: '', avatarUrl: '', createdAt: Date.now() }
  });
  return { openid, isNew: true, nickName: '', avatarUrl: '' };
};
