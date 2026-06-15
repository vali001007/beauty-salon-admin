import { getSkinRecommendations, getSkinReport } from "../../services/skin-test";

Page({
  data: {
    id: 0,
    report: null as any,
    recommendations: [] as any[],
  },
  onLoad(options: any) {
    const id = Number(options.id);
    this.setData({ id });
    this.loadReport(id);
  },
  async loadReport(id: number) {
    try {
      const [report, recommendations] = await Promise.all([getSkinReport(id), getSkinRecommendations(id)]);
      this.setData({ report, recommendations });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || "报告加载失败", icon: "none" });
    }
  },
});
