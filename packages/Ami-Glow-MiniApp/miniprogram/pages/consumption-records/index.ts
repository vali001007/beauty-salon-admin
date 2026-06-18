import { getConsumptionRecords } from "../../services/mine";

Page({
  data: {
    records: [] as any[],
  },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const result = await getConsumptionRecords({ pageSize: 30 });
      this.setData({ records: result.items });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || "请先绑定手机号", icon: "none" });
    }
  },
});
