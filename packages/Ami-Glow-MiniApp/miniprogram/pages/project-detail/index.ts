import { loginWithWechat } from "../../services/auth";
import { claimPromotion } from "../../services/promotion";
import { getAvailability, getAvailableBeauticians, getProjectDetail } from "../../services/project";
import { createReservation } from "../../services/reservation";
import type { AvailabilitySlot, BeauticianItem, ProjectItem } from "../../services/types";

Page({
  data: {
    id: 0,
    storeId: 0,
    project: null as (ProjectItem & { store?: any; details?: any; promotions?: any[] }) | null,
    showSheet: false,
    beauticians: [] as BeauticianItem[],
    slots: [] as AvailabilitySlot[],
    selectedDate: "",
    selectedBeauticianId: undefined as number | undefined,
    selectedPromotionId: undefined as number | undefined,
    claimingPromotionId: undefined as number | undefined,
  },
  onLoad(options: any) {
    const id = Number(options.id);
    const storeId = Number(options.storeId || 0);
    this.setData({ id, storeId });
    this.loadProject(id, storeId || undefined);
  },
  async loadProject(id: number, storeId?: number) {
    try {
      const project = await getProjectDetail(id, storeId);
      this.setData({ project, storeId: project.storeId });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || "项目加载失败", icon: "none" });
    }
  },
  async openReservation() {
    if (!this.data.project) return;
    try {
      const beauticians = await getAvailableBeauticians(this.data.project.id, this.data.project.storeId);
      this.setData({ showSheet: true, beauticians });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || "美容师加载失败", icon: "none" });
    }
  },
  async claimPromotion(event: any) {
    const promotionId = Number(event.currentTarget.dataset.id);
    if (!this.data.project || !promotionId) return;
    try {
      this.setData({ claimingPromotionId: promotionId });
      await loginWithWechat(this.data.project.storeId);
      await claimPromotion(promotionId, { storeId: this.data.project.storeId, channel: "project_detail" });
      this.setData({ selectedPromotionId: promotionId });
      wx.showToast({ title: "权益已领取", icon: "success" });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || "领取失败，请先绑定手机号", icon: "none" });
      wx.navigateTo({ url: "/pages/mine/index" });
    } finally {
      this.setData({ claimingPromotionId: undefined });
    }
  },
  closeReservation() {
    this.setData({ showSheet: false });
  },
  async handleReservationChange(event: any) {
    const { date, beauticianId } = event.detail;
    if (!this.data.project || !date) return;
    try {
      const result = await getAvailability({
        storeId: this.data.project.storeId,
        projectId: this.data.project.id,
        beauticianId,
        date,
      });
      this.setData({ slots: result.slots, selectedDate: date, selectedBeauticianId: beauticianId });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || "时段加载失败", icon: "none" });
    }
  },
  async confirmReservation(event: any) {
    if (!this.data.project) return;
    try {
      wx.showLoading({ title: "提交中", mask: true });
      await loginWithWechat(this.data.project.storeId);
      const reservation = await createReservation({
        storeId: this.data.project.storeId,
        projectId: this.data.project.id,
        beauticianId: event.detail.beauticianId,
        date: event.detail.date,
        startTime: event.detail.startTime,
        endTime: event.detail.endTime,
        channel: "project_detail",
        promotionId: this.data.selectedPromotionId,
      });
      wx.hideLoading();
      this.setData({ showSheet: false });
      wx.showModal({
        title: "预约已提交",
        content: `${reservation.projectName || this.data.project.name} ${reservation.date} ${reservation.startTime}`,
        confirmText: "查看预约",
        success: (result) => {
          if (result.confirm) wx.navigateTo({ url: "/pages/my-reservations/index" });
        },
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: (error as Error).message || "预约失败，请先绑定手机号", icon: "none" });
      wx.navigateTo({ url: "/pages/mine/index" });
    }
  },
  shareProject() {
    wx.showToast({ title: "可通过右上角分享给好友", icon: "none" });
  },
});
