import { getMemberCard } from "../../services/mine";

Page({
  data: {
    account: null as any,
  },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const account = await getMemberCard();
      this.setData({ account });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || "请先绑定手机号", icon: "none" });
    }
  },
});
