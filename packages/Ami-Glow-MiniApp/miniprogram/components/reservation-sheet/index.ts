import { buildWeek } from "../../utils/date";

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    store: {
      type: Object,
      value: {},
    },
    project: {
      type: Object,
      value: {},
    },
    beauticians: {
      type: Array,
      value: [],
    },
    slots: {
      type: Array,
      value: [],
    },
  },
  data: {
    weekOffset: 0,
    weekDays: buildWeek(0),
    selectedDate: buildWeek(0)[0].date,
    selectedBeauticianId: undefined as number | undefined,
    selectedStartTime: "",
  },
  methods: {
    close() {
      this.triggerEvent("close");
    },
    selectBeautician(event: any) {
      const id = Number(event.currentTarget.dataset.id);
      this.setData({ selectedBeauticianId: id || undefined, selectedStartTime: "" });
      this.triggerEvent("change", { beauticianId: id || undefined, date: this.data.selectedDate });
    },
    changeWeek(event: any) {
      const delta = Number(event.currentTarget.dataset.delta);
      const weekOffset = Math.max(0, this.data.weekOffset + delta);
      const weekDays = buildWeek(weekOffset);
      this.setData({ weekOffset, weekDays, selectedDate: weekDays[0].date, selectedStartTime: "" });
      this.triggerEvent("change", { beauticianId: this.data.selectedBeauticianId, date: weekDays[0].date });
    },
    selectDate(event: any) {
      const date = event.currentTarget.dataset.date;
      this.setData({ selectedDate: date, selectedStartTime: "" });
      this.triggerEvent("change", { beauticianId: this.data.selectedBeauticianId, date });
    },
    selectSlot(event: any) {
      const slot = event.currentTarget.dataset.slot;
      if (!slot.available) {
        wx.showToast({ title: slot.reason || "该时段不可预约", icon: "none" });
        return;
      }
      this.setData({ selectedStartTime: slot.startTime });
    },
    confirm() {
      if (!this.data.selectedStartTime) {
        wx.showToast({ title: "请选择预约时段", icon: "none" });
        return;
      }
      const slot = (this.properties.slots as any[]).find((item) => item.startTime === this.data.selectedStartTime);
      this.triggerEvent("confirm", {
        beauticianId: this.data.selectedBeauticianId,
        date: this.data.selectedDate,
        startTime: this.data.selectedStartTime,
        endTime: slot?.endTime,
      });
    },
  },
});
