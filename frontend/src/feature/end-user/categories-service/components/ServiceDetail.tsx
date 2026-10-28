"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  FileText,
  ImageOff,
  Layers3,
  Phone,
  Smartphone,
  Sparkles,
  Wrench,
} from "lucide-react";

import {
  useServiceDetailQuery,
  useServiceListQuery,
} from "@/feature/services/hooks/use-services";

import { Skeleton } from "@/components/ui/skeleton";
import { CategoryServiceNavbar } from "./CategoryServiceNavbar";
import { DownloadAppSection } from "./DownloadAppSection";
import { Footer } from "@/feature/landing-page/components/Footer";

export const ServiceDetail: React.FC = () => {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const id = params.id;

  // Lấy thông tin chi tiết dịch vụ
  const {
    data: service,
    isPending,
    isError,
    refetch,
  } = useServiceDetailQuery(id);

  // Lấy danh sách dịch vụ cùng danh mục
  const relatedQuery = useServiceListQuery({
    page: "1",
    limit: "12",
    isActive: "true",
    ...(service?.categoryId ? { categoryId: service.categoryId } : {}),
  });

  // Chỉ giữ dịch vụ cùng danh mục,
  // loại bỏ dịch vụ hiện tại
  const relatedServices = (relatedQuery.data?.data ?? [])
    .filter((item) => item.id !== id && item.categoryId === service?.categoryId)
    .slice(0, 4);

  const handleNavigateHome = () => {
    router.push("/");
  };

  const handleBack = () => {
    router.push("/services");
  };

  const handleSelectService = (serviceId: string) => {
    router.push(`/services/${serviceId}`);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const handleDownloadApp = () => {
    document.getElementById("download-app")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-[#0F1B33]">
      {/* NAVBAR */}
      <CategoryServiceNavbar
        currentView="discovery"
        onSelectView={handleBack}
        onNavigateHome={handleNavigateHome}
      />

      <main className="flex-1">
        {/* CHI TIẾT DỊCH VỤ */}
        <section className="bg-gradient-to-b from-[#F5F7FC] via-[#FAFBFE] to-white py-10 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {isPending ? (
              // LOADING
              <div className="space-y-8">
                <div className="space-y-3">
                  <Skeleton className="h-8 w-40 rounded-full" />
                  <Skeleton className="h-12 w-80 max-w-full" />
                  <Skeleton className="h-5 w-96 max-w-full" />
                </div>

                <div className="grid gap-10 rounded-[28px] border border-slate-100 bg-white p-6 shadow-sm lg:grid-cols-2 lg:p-10">
                  <Skeleton className="aspect-[4/3] w-full rounded-3xl" />

                  <div className="space-y-6">
                    <Skeleton className="h-8 w-32 rounded-full" />
                    <Skeleton className="h-10 w-3/4" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-32 w-full rounded-2xl" />
                  </div>
                </div>
              </div>
            ) : isError || !service ? (
              // ERROR
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
                  <AlertCircle size={30} />
                </div>

                <h1 className="text-xl font-bold">
                  Không thể tải thông tin dịch vụ
                </h1>

                <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
                  Dịch vụ không tồn tại hoặc đã xảy ra lỗi khi tải dữ liệu.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Thử lại
                  </button>

                  <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex items-center gap-2 rounded-full bg-[#FF5E14] px-6 py-3 text-sm font-bold text-white hover:bg-[#E9500B]"
                  >
                    <ArrowLeft size={18} />
                    Quay lại dịch vụ
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* TIÊU ĐỀ */}
                <div className="mb-8">
                  <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#FFE9DD] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#FF5E14]">
                    <Wrench size={14} />
                    Dịch vụ HandyGo
                  </span>

                  <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                    {service.name}
                  </h1>

                  <p className="mt-3 text-sm leading-7 text-slate-500 sm:text-base">
                    Khám phá thông tin dịch vụ và trải nghiệm đặt lịch tiện lợi
                    trên ứng dụng HandyGo.
                  </p>
                </div>

                {/* CARD CHI TIẾT */}
                <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-[0_20px_60px_rgba(15,27,51,0.06)] sm:p-8 lg:p-10">
                  <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
                    {/* ẢNH DỊCH VỤ */}
                    <div className="rounded-[28px] border border-[#E3EAF6] bg-[#EEF3FB] p-3 sm:p-4">
                      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-white">
                        {service.iconUrl ? (
                          <>
                            <img
                              src={service.iconUrl}
                              alt={service.name}
                              className="h-full w-full object-cover"
                            />

                            {/* <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
                              <Camera size={14} className="text-[#FF5E14]" />
                              Ảnh thực tế kỹ thuật viên HandyGo
                            </span> */}
                          </>
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                            <ImageOff size={40} />
                            <span className="text-sm">Chưa có hình ảnh</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* THÔNG TIN */}
                    <div className="flex flex-col">
                      {service.category?.name && (
                        <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-[#FFE9DD] px-3.5 py-1.5 text-sm font-bold text-[#FF5E14]">
                          <Layers3 size={15} />
                          {service.category.name}
                        </span>
                      )}

                      <h2 className="text-3xl font-black leading-tight sm:text-4xl">
                        {service.name}
                      </h2>

                      <div className="my-6 h-px bg-slate-100" />

                      {/* DANH MỤC */}
                      <div className="mb-6 flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFE9DD] text-[#FF5E14]">
                          <Layers3 size={20} />
                        </div>

                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Danh mục dịch vụ
                          </p>

                          <p className="font-bold">
                            {service.category?.name ?? "Chưa phân loại"}
                          </p>
                        </div>
                      </div>

                      {/* MÔ TẢ */}
                      <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFE9DD] text-[#FF5E14]">
                          <FileText size={20} />
                        </div>

                        <div className="min-w-0">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Mô tả dịch vụ
                          </p>

                          <p className="whitespace-pre-line break-words text-sm leading-7 text-slate-600 sm:text-[15px]">
                            {service.description ||
                              "Chưa có mô tả cho dịch vụ này."}
                          </p>
                        </div>
                      </div>

                      {/* GIỚI THIỆU TẢI APP */}
                      <div className="mt-8 rounded-2xl border border-orange-100 bg-[#FFF6EF] p-5">
                        <div className="flex items-start gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFE3D0] text-[#FF5E14]">
                            <Smartphone size={22} />
                          </div>

                          <div>
                            <h3 className="font-extrabold">
                              Đặt dịch vụ dễ dàng với HandyGo
                            </h3>

                            <p className="mt-1.5 text-sm leading-6 text-slate-600">
                              Tải ứng dụng HandyGo để tìm thợ, đặt dịch vụ và
                              theo dõi tiến độ ngay trên điện thoại của bạn.
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            onClick={handleDownloadApp}
                            className="group inline-flex h-12 items-center justify-center gap-3 rounded-full bg-[#FFBA08] py-1.5 pl-1.5 pr-5 text-sm font-bold text-slate-950 shadow-sm transition-all duration-300 hover:bg-[#FFCA36] hover:shadow-md active:scale-[0.97]"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
                              <img
                                src="/ggplay.svg"
                                alt="Google Play"
                                className="h-6 w-6 object-contain"
                              />
                            </span>
                            <span className="whitespace-nowrap">
                              Tải ứng dụng
                            </span>
                          </button>

                          {/* <a
                            href="tel:19006868"
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-100 bg-white px-5 py-3.5 text-sm font-bold text-slate-700 transition-colors hover:border-[#FF5E14] hover:text-[#FF5E14]"
                          >
                            <Phone size={17} className="text-[#FF5E14]" />
                            1900 6868
                          </a> */}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* NÚT QUAY LẠI */}
                <button
                  type="button"
                  onClick={handleBack}
                  className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-[#FF5E14]"
                >
                  <ArrowLeft size={18} />
                  Quay lại danh sách dịch vụ
                </button>
              </>
            )}
          </div>
        </section>

        {/* DỊCH VỤ LIÊN QUAN - CÙNG DANH MỤC */}
        {service && !isError && (
          <section className="border-t border-slate-100 bg-[#F8F9FB] py-14 sm:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              {/* HEADER */}
              <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#FF5E14]">
                    <Sparkles size={16} />
                    Có thể bạn quan tâm
                  </div>

                  <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
                    Dịch vụ liên quan
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    Khám phá thêm các dịch vụ thuộc danh mục{" "}
                    <span className="font-semibold text-[#FF5E14]">
                      {service.category?.name ?? "hiện tại"}
                    </span>
                    .
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-2 text-sm font-bold text-[#FF5E14] hover:text-[#E9500B]"
                >
                  Xem tất cả dịch vụ
                  <ArrowRight size={17} />
                </button>
              </div>

              {/* LOADING */}
              {relatedQuery.isPending || relatedQuery.isFetching ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="rounded-2xl bg-white p-4">
                      <Skeleton className="mb-4 h-44 w-full rounded-xl" />
                      <Skeleton className="mb-3 h-4 w-24" />
                      <Skeleton className="mb-3 h-6 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ))}
                </div>
              ) : relatedQuery.isError ? (
                // ERROR
                <div className="rounded-2xl bg-white p-8 text-center">
                  <p className="text-sm text-slate-500">
                    Chưa thể tải các dịch vụ liên quan.
                  </p>

                  <button
                    type="button"
                    onClick={() => relatedQuery.refetch()}
                    className="mt-3 text-sm font-bold text-[#FF5E14]"
                  >
                    Thử lại
                  </button>
                </div>
              ) : relatedServices.length === 0 ? (
                // EMPTY
                <div className="rounded-2xl bg-white p-10 text-center">
                  <Layers3 size={32} className="mx-auto mb-3 text-[#FF5E14]" />

                  <p className="font-semibold text-slate-700">
                    Chưa có dịch vụ liên quan trong danh mục này.
                  </p>
                </div>
              ) : (
                // DANH SÁCH DỊCH VỤ LIÊN QUAN
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {relatedServices.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectService(item.id)}
                      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white p-3 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-orange-200 hover:shadow-xl"
                    >
                      {/* HÌNH ẢNH */}
                      <div className="mb-4 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-[#EEF3FB]">
                        {item.iconUrl ? (
                          <img
                            src={item.iconUrl}
                            alt={item.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <ImageOff size={32} className="text-slate-300" />
                        )}
                      </div>

                      {/* NỘI DUNG */}
                      <div className="flex flex-1 flex-col px-2 pb-2">
                        <span className="mb-2 text-xs font-bold text-[#FF5E14]">
                          {item.category?.name ??
                            service.category?.name ??
                            "Dịch vụ HandyGo"}
                        </span>

                        <h3 className="line-clamp-2 text-base font-extrabold leading-6 transition-colors group-hover:text-[#FF5E14]">
                          {item.name}
                        </h3>

                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                          {item.description ||
                            "Khám phá thông tin dịch vụ trên HandyGo."}
                        </p>

                        <div className="mt-auto flex items-center gap-2 pt-5 text-sm font-bold text-[#FF5E14]">
                          Xem chi tiết
                          <ArrowRight
                            size={16}
                            className="transition-transform group-hover:translate-x-1"
                          />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* BANNER TẢI ỨNG DỤNG CÓ SẴN */}
        <DownloadAppSection />
        <Footer
          onOpenDownload={() => {
            const section = document.getElementById("download-app");

            if (section) {
              section.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            } else {
              window.location.href = "/services#download-app";
            }
          }}
        />
      </main>
    </div>
  );
};

export default ServiceDetail;
