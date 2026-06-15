import { loginWithWechat } from "../../services/auth";
import { analyzeSkin } from "../../services/skin-test";

Page({
  data: {
    imagePath: "",
    agreed: false,
  },
  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },
  chooseImage() {
    if (!this.data.agreed) {
      wx.showToast({ title: "请先确认隐私与测肤提示", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (result) => {
        const file = result.tempFiles[0];
        if (file?.tempFilePath) this.setData({ imagePath: file.tempFilePath });
      },
    });
  },
  submit() {
    if (!this.data.imagePath) {
      wx.showToast({ title: "请先拍照或上传图片", icon: "none" });
      return;
    }
    wx.showLoading({ title: "AI分析中", mask: true });
    wx.getFileSystemManager().readFile({
      filePath: this.data.imagePath,
      encoding: "base64",
      success: async (result) => {
        try {
          await loginWithWechat();
          const report = await analyzeSkin(`data:image/jpeg;base64,${result.data}`);
          wx.hideLoading();
          wx.redirectTo({ url: `/pages/skin-report/index?id=${report.id}` });
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: (error as Error).message || "测肤失败，请先绑定手机号", icon: "none" });
          wx.navigateTo({ url: "/pages/mine/index" });
        }
      },
      fail: (error) => {
        wx.hideLoading();
        wx.showToast({ title: error.errMsg || "图片读取失败", icon: "none" });
      },
    });
  },
});
