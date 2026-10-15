
export interface CategoryItem {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // Số lượng dịch vụ thuộc danh mục, tính từ bảng services
  servicesCount: number;

  // Mã hiển thị tự quy ước ở frontend, không phải cột DB
  code?: string;
}
