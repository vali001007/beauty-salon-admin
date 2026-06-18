export type ActivityPageSectionType =
  | 'hero'
  | 'offer'
  | 'benefits'
  | 'project_recommendation'
  | 'product_recommendation'
  | 'skin_care_advice'
  | 'consultant_note'
  | 'faq'
  | 'notice'
  | 'store_info';

export type ActivityPageSection =
  | {
      type: 'hero';
      badge?: string;
      title: string;
      subtitle?: string;
      description?: string;
      imageUrl?: string;
    }
  | {
      type: 'offer';
      title: string;
      offer: string;
      description?: string;
      validFrom?: string;
      validTo?: string;
      highlights?: string[];
    }
  | {
      type: 'benefits';
      title: string;
      items: Array<{ title: string; description: string; icon?: string }>;
    }
  | {
      type: 'project_recommendation';
      title: string;
      items: Array<{
        name: string;
        description?: string;
        originalPrice?: number;
        activityPrice?: number;
        reason?: string;
      }>;
    }
  | {
      type: 'product_recommendation';
      title: string;
      items: Array<{
        name: string;
        description?: string;
        originalPrice?: number;
        activityPrice?: number;
        category?: string;
      }>;
    }
  | {
      type: 'skin_care_advice';
      title: string;
      advice: string;
      tags?: string[];
    }
  | {
      type: 'consultant_note';
      title: string;
      note: string;
      consultantName?: string;
    }
  | {
      type: 'faq';
      title: string;
      items: Array<{ question: string; answer: string }>;
    }
  | {
      type: 'notice';
      title: string;
      items: string[];
    }
  | {
      type: 'store_info';
      title: string;
      storeName: string;
      address?: string;
      phone?: string;
    };

export interface ActivityPageSchema {
  schemaVersion: '1.0';
  title: string;
  subtitle?: string;
  audienceLabel: string;
  theme: {
    tone: 'warm' | 'professional' | 'premium' | 'friendly';
    primaryColor?: string;
    backgroundColor?: string;
  };
  sections: ActivityPageSection[];
  cta: {
    text: string;
    action: 'book' | 'claim_coupon' | 'contact_consultant';
  };
  safety: {
    customerFacing: boolean;
    blocked: boolean;
    reasons: string[];
  };
}

export interface PublicMarketingPage {
  slug: string;
  title: string;
  pageSchema: ActivityPageSchema;
  shareTitle?: string | null;
  shareDescription?: string | null;
  shareImage?: string | null;
  shareUrl?: string | null;
  miniappPath?: string | null;
  publishedAt?: string | null;
}
