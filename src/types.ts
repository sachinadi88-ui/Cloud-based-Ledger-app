export interface LedgerRow {
  id: string;
  particulars1: string;
  particulars2: string;
  amount: number;
  paymentMode: 'Cash' | 'Online';
  person: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  people: string[];
  updatedAt: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
