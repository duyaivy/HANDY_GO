import { authLocales } from '@/features/auth/locales';
import { devDemoLocales } from '@/features/dev-demo/locales';
import { homeCustomerLocales } from '@/features/home/customer/locales';
import { homeWorkerLocales } from '@/features/home/worker/locales';
import { ordersCustomerLocales } from '@/features/orders/customer/locales';
import { ordersWorkerLocales } from '@/features/orders/worker/locales';
import { profileCustomerLocales } from '@/features/profile/customer/locales';
import { profileWorkerLocales } from '@/features/profile/worker/locales';
import ar from '@/translations/ar.json';
import en from '@/translations/en.json';
import vi from '@/translations/vi.json';

export const resources = {
  en: {
    translation: en,
    auth: authLocales.en,
    devDemo: devDemoLocales.en,
    homeCustomer: homeCustomerLocales.en,
    homeWorker: homeWorkerLocales.en,
    ordersCustomer: ordersCustomerLocales.en,
    ordersWorker: ordersWorkerLocales.en,
    profileCustomer: profileCustomerLocales.en,
    profileWorker: profileWorkerLocales.en,
  },
  vi: {
    translation: vi,
    auth: authLocales.vi,
    devDemo: devDemoLocales.vi,
    homeCustomer: homeCustomerLocales.vi,
    homeWorker: homeWorkerLocales.vi,
    ordersCustomer: ordersCustomerLocales.vi,
    ordersWorker: ordersWorkerLocales.vi,
    profileCustomer: profileCustomerLocales.vi,
    profileWorker: profileWorkerLocales.vi,
  },
  ar: {
    translation: ar,
    auth: authLocales.en,
    devDemo: devDemoLocales.en,
    homeCustomer: homeCustomerLocales.en,
    homeWorker: homeWorkerLocales.en,
    ordersCustomer: ordersCustomerLocales.en,
    ordersWorker: ordersWorkerLocales.en,
    profileCustomer: profileCustomerLocales.en,
    profileWorker: profileWorkerLocales.en,
  },
};

export type Language = keyof typeof resources;
