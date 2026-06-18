import { cancelReservation, getMyReservations } from "../../services/reservation";
import type { ReservationItem } from "../../services/types";

Page({
  data: {
    items: [] as ReservationItem[],
  },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const result = await getMyReservations({ pageSize: 30 });
      this.setData({ items: result.items });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || "请先绑定手机号", icon: "none" });
    }
  },
  cancel(event: any) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "取消预约",
      content: "确认取消该预约吗？",
      confirmText: "取消预约",
      success: async (result) => {
        if (!result.confirm) return;
        await cancelReservation(id, "客户在 Ami Glow 取消");
        this.load();
      },
    });
  },
});
