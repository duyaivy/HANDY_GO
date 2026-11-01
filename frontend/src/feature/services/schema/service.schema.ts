export type ServiceResType = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category: {
    id: string;
    name: string;
    imageUrl: string | null;
  };
};
export type ServiceDetailResType = ServiceResType;

export type CreateServiceBodyType = {
  categoryId: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
};
export type UpdateServiceBodyType = {
  categoryId: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
};