const splitConfiguredImages = (value?: string) =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

export const MARKETING_SHARE_BASE_URL = (
  import.meta.env.VITE_MARKETING_SHARE_BASE_URL || 'https://mini.ami-core.com'
).replace(/\/+$/, '');

export function buildMarketingActivityUrl(activityId: string | number) {
  return `${MARKETING_SHARE_BASE_URL}/activity/${activityId}`;
}

export const MARKETING_RECOMMENDATION_IMAGES = [
  ...splitConfiguredImages(import.meta.env.VITE_MARKETING_RECOMMENDATION_IMAGES),
  'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=400',
  'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400',
  'https://images.unsplash.com/photo-1573461160327-b450ce3d8e7f?w=400',
  'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=400',
  'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400',
  'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400',
  'https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=400',
  'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=400',
];

export const MARKETING_POSTER_TEMPLATES = [
  {
    id: 1,
    backgroundColor: '#FF6B9D',
    imageUrl: import.meta.env.VITE_MARKETING_POSTER_IMAGE_1 || 'https://images.unsplash.com/photo-1611169035510-f9af52e6dbe2?w=600',
    titleColor: '#FFFFFF',
  },
  {
    id: 2,
    backgroundColor: '#6B5CE7',
    imageUrl: import.meta.env.VITE_MARKETING_POSTER_IMAGE_2 || 'https://images.unsplash.com/photo-1527632911563-ee5b6d53465b?w=600',
    titleColor: '#FFFFFF',
  },
  {
    id: 3,
    backgroundColor: '#10B981',
    imageUrl: import.meta.env.VITE_MARKETING_POSTER_IMAGE_3 || 'https://images.unsplash.com/photo-1531299244174-d247dd4e5a66?w=600',
    titleColor: '#FFFFFF',
  },
];
