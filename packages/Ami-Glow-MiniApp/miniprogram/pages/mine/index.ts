import { bindPhone, getMe, loginWithWechat } from "../../services/auth";
import type { CustomerProfile } from "../../services/types";

Page({
  data: {
    me: null as CustomerProfile | null,
  },
  onShow() {
    this.loadMe();
  },
  async loadMe() {
    try {
      await loginWithWechat();
      const me = await getMe();
      this.setData({ me });
    } catch {
      this.setData({ me: null });
    }
  },
  bindPhone() {
    wx.showModal({
      title: "绑定手机号",
      content: "当前演示版本将使用 13800000000 作为绑定手机号。正式版将接入微信手机号授权。",
      confirmText: "绑定",
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await loginWithWechat();
          const response = await bindPhone("13800000000", "微信客户", this.data.me?.storeId);
          this.setData({ me: response.customer });
          wx.showToast({ title: "绑定成功", icon: "success" });
        } catch (error) {
          wx.showToast({ title: (error as Error).message || "绑定失败", icon: "none" });
        }
      },
    });
  },
  openPage(event: any) {
    const url = event.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },
  callService() {
    wx.navigateTo({ url: "/pages/tools/index" });
  },
  goHome() {
    wx.redirectTo({ url: "/pages/home/index" });
  },
  goBooking() {
    wx.redirectTo({ url: "/pages/booking/index" });
  },
  goTools() {
    wx.redirectTo({ url: "/pages/tools/index" });
  },
});
