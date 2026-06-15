import { getProjects } from "../../services/project";
import type { ProjectItem } from "../../services/types";

Page({
  data: {
    keyword: "",
    recommended: true,
    page: 1,
    pageSize: 10,
    total: 0,
    projects: [] as ProjectItem[],
    loading: false,
  },
  onLoad() {
    this.loadProjects(true);
  },
  onReachBottom() {
    if (this.data.projects.length < this.data.total) this.loadProjects(false);
  },
  onKeywordInput(event: any) {
    this.setData({ keyword: event.detail.value });
  },
  search() {
    this.loadProjects(true);
  },
  setRecommended(event: any) {
    this.setData({ recommended: event.currentTarget.dataset.value === "true" });
    this.loadProjects(true);
  },
  async loadProjects(reset: boolean) {
    try {
      const page = reset ? 1 : this.data.page + 1;
      this.setData({ loading: true });
      const result = await getProjects({
        keyword: this.data.keyword,
        recommended: this.data.recommended,
        page,
        pageSize: this.data.pageSize,
      });
      this.setData({
        page,
        total: result.total,
        projects: reset ? result.items : [...this.data.projects, ...result.items],
      });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || "项目加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },
  openFilter() {
    wx.showToast({ title: "筛选功能将在下一阶段开放", icon: "none" });
  },
  goHome() {
    wx.redirectTo({ url: "/pages/home/index" });
  },
  goTools() {
    wx.redirectTo({ url: "/pages/tools/index" });
  },
  goMine() {
    wx.redirectTo({ url: "/pages/mine/index" });
  },
});
