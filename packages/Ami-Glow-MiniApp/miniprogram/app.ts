type AmiGlowGlobalData = {
  apiBaseUrl: string;
  token?: string;
  storeId?: number;
};

App<{ globalData: AmiGlowGlobalData }>({
  globalData: {
    apiBaseUrl: "http://127.0.0.1:8080/api",
  },
  onLaunch() {
    const token = wx.getStorageSync("ami_glow_token");
    const storeId = wx.getStorageSync("ami_glow_store_id");
    if (token) this.globalData.token = token;
    if (storeId) this.globalData.storeId = Number(storeId);
  },
});
