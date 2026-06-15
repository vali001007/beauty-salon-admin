type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: Record<string, any>;
  auth?: boolean;
};

type AppInstance = {
  globalData: {
    apiBaseUrl: string;
    token?: string;
    storeId?: number;
  };
};

export function getToken() {
  const app = getApp<AppInstance>();
  return app.globalData.token || wx.getStorageSync<string>("ami_glow_token");
}

export function setToken(token: string) {
  const app = getApp<AppInstance>();
  app.globalData.token = token;
  wx.setStorageSync("ami_glow_token", token);
}

export function getStoreId() {
  const app = getApp<AppInstance>();
  return app.globalData.storeId || Number(wx.getStorageSync("ami_glow_store_id")) || undefined;
}

export function setStoreId(storeId: number) {
  const app = getApp<AppInstance>();
  app.globalData.storeId = storeId;
  wx.setStorageSync("ami_glow_store_id", storeId);
}

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const app = getApp<AppInstance>();
  const token = getToken();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    wx.request<T>({
      url: `${app.globalData.apiBaseUrl}${path}`,
      method: options.method || "GET",
      data: options.data,
      header: headers,
      success: (result) => {
        if (result.statusCode >= 200 && result.statusCode < 300) {
          resolve(result.data);
          return;
        }
        const payload = result.data as any;
        reject(new Error(payload?.message || `请求失败：${result.statusCode}`));
      },
      fail: (error) => reject(new Error(error.errMsg || "网络异常")),
    });
  });
}

export function buildQuery(params: Record<string, any>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return "";
  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")}`;
}
