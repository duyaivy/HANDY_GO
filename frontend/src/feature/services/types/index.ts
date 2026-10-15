
export interface ServiceItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
}

export interface ServiceFormData {
  categoryId: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
}
