declare const wx: {
  getStorageSync<T = any>(key: string): T;
  setStorageSync(key: string, data: any): void;
  removeStorageSync(key: string): void;
  request<T = any>(options: {
    url: string;
    method?: string;
    data?: any;
    header?: Record<string, string>;
    success?: (result: { statusCode: number; data: T }) => void;
    fail?: (error: { errMsg: string }) => void;
  }): void;
  navigateTo(options: { url: string }): void;
  redirectTo(options: { url: string }): void;
  switchTab?(options: { url: string }): void;
  showToast(options: { title: string; icon?: "success" | "error" | "loading" | "none"; duration?: number }): void;
  showModal(options: {
    title: string;
    content: string;
    confirmText?: string;
    cancelText?: string;
    success?: (result: { confirm: boolean; cancel: boolean }) => void;
  }): void;
  showLoading(options: { title: string; mask?: boolean }): void;
  hideLoading(): void;
  login(options: { success?: (result: { code: string }) => void; fail?: (error: { errMsg: string }) => void }): void;
  chooseMedia(options: {
    count: number;
    mediaType: string[];
    sourceType?: string[];
    success?: (result: { tempFiles: Array<{ tempFilePath: string; size: number }> }) => void;
    fail?: (error: { errMsg: string }) => void;
  }): void;
  getFileSystemManager(): {
    readFile(options: {
      filePath: string;
      encoding: "base64";
      success?: (result: { data: string }) => void;
      fail?: (error: { errMsg: string }) => void;
    }): void;
  };
  makePhoneCall(options: { phoneNumber: string }): void;
  scanCode(options: { success?: (result: { result: string }) => void; fail?: (error: { errMsg: string }) => void }): void;
};

type MiniProgramPageInstance = {
  data: Record<string, any>;
  setData(data: Record<string, any>, callback?: () => void): void;
};

type MiniProgramComponentInstance = MiniProgramPageInstance & {
  properties: Record<string, any>;
  triggerEvent(name: string, detail?: Record<string, any>): void;
};

declare function App<T extends Record<string, any>>(options: T & Record<string, any>): void;
declare function Page<T extends Record<string, any>>(options: T & ThisType<T & MiniProgramPageInstance>): void;
declare function Component<T extends Record<string, any>>(
  options: T & {
    methods?: Record<string, (this: T & MiniProgramComponentInstance, ...args: any[]) => any>;
  } & ThisType<T & MiniProgramComponentInstance>,
): void;
declare function getApp<T = any>(): T;
