import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// zh-CN locale files
import zhCommon from './locales/zh-CN/common.json';
import zhMenu from './locales/zh-CN/menu.json';
import zhCustomer from './locales/zh-CN/customer.json';
import zhProduct from './locales/zh-CN/product.json';
import zhOrder from './locales/zh-CN/order.json';
import zhMarketing from './locales/zh-CN/marketing.json';
import zhSystem from './locales/zh-CN/system.json';
import zhStore from './locales/zh-CN/store.json';
import zhInventory from './locales/zh-CN/inventory.json';
import zhScheduling from './locales/zh-CN/scheduling.json';
import zhAi from './locales/zh-CN/ai.json';
import zhDashboard from './locales/zh-CN/dashboard.json';

// en locale files
import enCommon from './locales/en/common.json';
import enMenu from './locales/en/menu.json';
import enCustomer from './locales/en/customer.json';
import enProduct from './locales/en/product.json';
import enOrder from './locales/en/order.json';
import enMarketing from './locales/en/marketing.json';
import enSystem from './locales/en/system.json';
import enStore from './locales/en/store.json';
import enInventory from './locales/en/inventory.json';
import enScheduling from './locales/en/scheduling.json';
import enAi from './locales/en/ai.json';
import enDashboard from './locales/en/dashboard.json';

export const defaultNS = 'common';

export const resources = {
  'zh-CN': {
    common: zhCommon,
    menu: zhMenu,
    customer: zhCustomer,
    product: zhProduct,
    order: zhOrder,
    marketing: zhMarketing,
    system: zhSystem,
    store: zhStore,
    inventory: zhInventory,
    scheduling: zhScheduling,
    ai: zhAi,
    dashboard: zhDashboard,
  },
  en: {
    common: enCommon,
    menu: enMenu,
    customer: enCustomer,
    product: enProduct,
    order: enOrder,
    marketing: enMarketing,
    system: enSystem,
    store: enStore,
    inventory: enInventory,
    scheduling: enScheduling,
    ai: enAi,
    dashboard: enDashboard,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS,
    ns: [
      'common',
      'menu',
      'customer',
      'product',
      'order',
      'marketing',
      'system',
      'store',
      'inventory',
      'scheduling',
      'ai',
      'dashboard',
    ],
    lng: 'zh-CN',
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

export default i18n;
