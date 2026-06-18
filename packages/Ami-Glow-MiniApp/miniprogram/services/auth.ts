import { request, setStoreId, setToken } from "./request";
import type { CustomerProfile } from "./types";

export function loginWithWechat(storeId?: number) {
  return new Promise<{ token: string; bindStatus: string; customer: CustomerProfile | null }>((resolve, reject) => {
    wx.login({
      success: async (result) => {
        try {
          const response = await request<{ token: string; bindStatus: string; customer: CustomerProfile | null }>(
            "/customer-app/auth/wechat-login",
            {
              method: "POST",
              data: { code: result.code || `dev-${Date.now()}`, storeId },
            },
          );
          setToken(response.token);
          if (response.customer?.storeId) setStoreId(response.customer.storeId);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      },
      fail: (error) => reject(new Error(error.errMsg || "微信登录失败")),
    });
  });
}

export async function bindPhone(phone: string, name?: string, storeId?: number) {
  const response = await request<{ token: string; bindStatus: string; customer: CustomerProfile }>(
    "/customer-app/auth/bind-phone",
    {
      method: "POST",
      data: { phone, name, storeId },
    },
  );
  setToken(response.token);
  setStoreId(response.customer.storeId);
  return response;
}

export function getMe() {
  return request<CustomerProfile>("/customer-app/me");
}
