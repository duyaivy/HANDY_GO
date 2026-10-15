"use client";
import React, { useState } from "react";
import { DashboardHeader } from "./components/DashboardHeader";
import { DashboardKpiCards } from "./components/DashboardKpiCards";
import { DashboardTrendChart } from "./components/DashboardTrendChart";

import { DashboardPopularServices } from "./components/DashboardPopularServices";
import { DashboardRecentOrders } from "./components/DashboardRecentOrders";
import { DashboardOrderStatusDonut } from "./components/DashboardOrderStatusDonut";

export default function DashboardPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* 1. HEADER: TIÊU ĐỀ + HÔM NAY + LÀM MỚI */}
      <DashboardHeader
        dateText="Hôm nay: 24/10/2024"
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* 2. CÁC THẺ KPI STAT CARDS (4 CARDS) */}
      <DashboardKpiCards />

      {/* 3. BIỂU ĐỒ XU HƯỚNG ĐƠN HÀNG THEO THỜI GIAN */}
      <DashboardTrendChart />

      {/* 4. HÀNG 2 CỘT: TRẠNG THÁI ĐƠN & DỊCH VỤ PHỔ BIẾN */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DashboardOrderStatusDonut />
        <DashboardPopularServices />
      </div>

      {/* 5. BẢNG ĐƠN HÀNG GẦN ĐÂY */}
      <DashboardRecentOrders />
    </div>
  );
}

export { DashboardPage };
