export interface ChairItem {
  id: string;
  name: string;
  code?: string;
  branchName: string;
  roomName: string;
  status: 'OPERATIONAL' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
  isAvailableForBooking: boolean;
}

export interface BranchItem {
  id: string;
  name: string;
  city: string;
  address: string;
  phone?: string;
  status: string;
  chairCount: number;
}

export interface StaffItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  roles: string[];
  isActive: boolean;
  iin?: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  createdAt: string;
  hash: string;
  previousHash?: string;
}

export interface OutboxItem {
  id: string;
  eventName: string;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  scheduledAt: string;
  publishedAt?: string;
  retryCount: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') || 'demo-tenant-almaty' : 'demo-tenant-almaty';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-Id': tenantId,
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API error: ${res.statusText}`);
    }

    return await res.json();
  } catch (err: any) {
    console.warn(`Fetch error for ${endpoint}: ${err.message}. Using client state.`);
    throw err;
  }
}
