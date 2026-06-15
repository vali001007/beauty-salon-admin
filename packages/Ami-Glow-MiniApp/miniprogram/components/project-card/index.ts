Component({
  properties: {
    project: {
      type: Object,
      value: {},
    },
    layout: {
      type: String,
      value: "compact",
    },
  },
  methods: {
    handleTap() {
      const project = this.properties.project as any;
      if (!project?.id) return;
      wx.navigateTo({ url: `/pages/project-detail/index?id=${project.id}&storeId=${project.storeId || ""}` });
    },
  },
});
