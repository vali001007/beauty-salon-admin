import { getContact } from "../../services/home";

Page({
  data: {
    knowledge: ["抗衰老护肤步骤", "如何正确使用眼霜?", "正确的洗脸方式是怎样的?", "如何去除黑头?", "不同季节护肤重点是什么?"],
  },
  goSkinTest() {
    wx.navigateTo({ url: "/pages/skin-test/index" });
  },
  openKnowledge() {
    wx.showToast({ title: "护肤知识详情将在下一阶段开放", icon: "none" });
  },
  async callService() {
    try {
      const contact = await getContact();
      if (!contact.phone) {
        wx.showToast({ title: "门店暂未配置客服电话", icon: "none" });
        return;
      }
      wx.makePhoneCall({ phoneNumber: contact.phone });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || "客服信息加载失败", icon: "none" });
    }
  },
  goHome() {
    wx.redirectTo({ url: "/pages/home/index" });
  },
  goBooking() {
    wx.redirectTo({ url: "/pages/booking/index" });
  },
  goMine() {
    wx.redirectTo({ url: "/pages/mine/index" });
  },
});
