import { getHome } from "../../services/home";
import { trackEvent } from "../../services/event";
import type { HomeData } from "../../services/types";

Page({
  data: {
    loading: true,
    home: null as HomeData | null,
  },
  onLoad() {
    this.loadHome();
  },
  onPullDownRefresh() {
    this.loadHome();
  },
  async loadHome() {
    try {
      this.setData({ loading: true });
      const home = await getHome({ channel: "home" });
      this.setData({ home });
      trackEvent({ eventType: "miniapp_view_home", storeId: home.store.id, channel: "home" });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || "首页加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },
  openScan() {
    wx.scanCode({
      success: (result) => wx.showToast({ title: result.result ? "扫码成功" : "扫码完成", icon: "none" }),
    });
  },
  openBanner(event: any) {
    const banner = event.currentTarget.dataset.banner;
    if (!banner) return;
    trackEvent({
      eventType: "miniapp_click_banner",
      storeId: this.data.home?.store.id,
      targetType: banner.targetType,
      targetId: banner.targetId,
      channel: "home_banner",
    });
    if (banner.targetType === "project") {
      wx.navigateTo({ url: `/pages/project-detail/index?id=${banner.targetId}&storeId=${this.data.home?.store.id || ""}` });
    }
  },
  goBooking() {
    wx.redirectTo({ url: "/pages/booking/index" });
  },
  goTools() {
    wx.redirectTo({ url: "/pages/tools/index" });
  },
  goMine() {
    wx.redirectTo({ url: "/pages/mine/index" });
  },
});
