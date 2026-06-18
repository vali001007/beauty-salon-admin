import { getMyCards } from "../../services/mine";

Page({
  data: {
    cards: [] as any[],
  },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const cards = await getMyCards();
      this.setData({ cards });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || "请先绑定手机号", icon: "none" });
    }
  },
});
