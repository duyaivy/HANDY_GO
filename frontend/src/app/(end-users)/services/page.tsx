import CategoryService from '@/feature/end-user/categories-service/components/CategoryService';
import React from 'react';
;

// Next.js Route: /(end-user)/category_service
// Trang này chỉ gọi lại UI từ features/end-user/category-service
export default function CategoryServiceAppPage() {
  return <CategoryService />;
}
