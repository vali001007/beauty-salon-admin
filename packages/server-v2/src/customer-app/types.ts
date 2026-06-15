export type CustomerAppTokenPayload = {
  sub: string;
  openid: string;
  identityId?: number;
  unionid?: string;
  customerId?: number;
  storeId?: number;
  phone?: string;
  nickname?: string;
  avatarUrl?: string;
};

export type CustomerAppRequestContext = CustomerAppTokenPayload & {
  token: string;
};
