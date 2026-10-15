import DashboardPage from '@/feature/dashboard/page';
import React from 'react';


// Next.js Route: /manage/dashboard
// Trang này chỉ gọi lại page.tsx chung từ features/dashboard
export default function ManageDashboardPage() {
  return <DashboardPage />;
}
