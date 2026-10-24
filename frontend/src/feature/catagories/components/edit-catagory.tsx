"use client";

import React, { useState, useRef } from "react";
import { X, ArrowUp } from "lucide-react";
import { CategoryItem } from "../types";
import { useUploadImage } from "@/feature/uploads/hooks/use-upload";
import { useUpdateCategory } from "../hooks/use-categories";

export interface EditCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: CategoryItem | null;
}

type EditCatalogFormProps = {
  onClose: () => void;
  category: CategoryItem;
};

const EditCatalogForm: React.FC<EditCatalogFormProps> = ({
  onClose,
  category,
}) => {
  // =========================
  // STATE
  // =========================
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const updateCategory = useUpdateCategory();
  const uploadImage = useUploadImage();

  const [name, setName] = useState(category?.name || "");

  const [description, setDescription] = useState(category?.description || "");

  const [status, setStatus] = useState<"Active" | "Disabled">(
    category?.isActive === false ? "Disabled" : "Active",
  );

  const [previewImage, setPreviewImage] = useState(category?.imageUrl || "");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // =========================
  // CHỌN ẢNH
  // =========================
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      console.error("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP");
      e.target.value = "";
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();

    reader.onloadend = () => {
      setPreviewImage(reader.result as string);
    };

    reader.readAsDataURL(file);
  };

  // =========================
  // LƯU
  // =========================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || updateCategory.isPending || uploadImage.isPending) {
      return;
    }

    try {
      // Giữ ảnh cũ nếu không thay ảnh
      let imageUrl: string | null = category.imageUrl ?? null;

      // Nếu chọn ảnh mới thì upload trước
      if (selectedFile) {
        const uploadResponse = await uploadImage.mutateAsync(selectedFile);

        imageUrl = uploadResponse.payload.data.url;

        if (!imageUrl) {
          throw new Error("Không nhận được URL ảnh từ Backend");
        }
      }

      // Gọi API PATCH cập nhật danh mục
      await updateCategory.mutateAsync({
        id: category.id,
        body: {
          name: name.trim(),
          description: description.trim(),
          imageUrl,
          parentId: category.parentId ?? null,
          isActive: status === "Active",
        },
      });

      // Đóng form khi cập nhật thành công
      onClose();
    } catch (error) {
      console.error("Lỗi cập nhật danh mục:", error);
    }
  };
  // =========================
  // UI
  // =========================

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      {/* BACKDROP */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* MODAL */}
      <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-150 z-10 my-auto animate-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">
            Chỉnh sửa danh mục
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* =========================
              HÌNH ẢNH
          ========================= */}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">
              Hình ảnh
            </label>

            <div className="flex items-center gap-3">
              {/* ẢNH HIỆN TẠI */}
              {/* ẢNH HIỆN TẠI */}
              <div className="w-24 h-24 rounded-2xl border border-orange-200 bg-[#FFF9F5] flex flex-col items-center justify-center gap-1 overflow-hidden shrink-0 shadow-2xs p-1">
                <div className="w-full flex-1 min-h-0 overflow-hidden rounded-xl">
                  {previewImage ? (
                    <img
                      src={previewImage}
                      alt={category.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-orange-100 flex items-center justify-center text-[#FF5E14] font-bold">
                      ⚡
                    </div>
                  )}
                </div>

                {/* <span className="text-[9px] uppercase font-bold text-slate-700 tracking-wider text-center leading-tight shrink-0">
                  ẢNH HIỆN TẠI
                </span> */}
              </div>

              {/* THAY ẢNH */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-2xl border-2 border-dashed border-orange-300 hover:border-orange-500 bg-white hover:bg-orange-50/40 flex flex-col items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer group shadow-2xs"
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-orange-100 group-hover:text-[#FF5E14] transition-all">
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </div>

                {/* <span className="text-xs font-semibold text-slate-700 group-hover:text-orange-600 transition-colors">
                  Thay ảnh
                </span> */}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* =========================
              TÊN DANH MỤC
          ========================= */}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Tên danh mục <span className="text-rose-500">*</span>
            </label>

            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập tên danh mục..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 transition-all shadow-2xs"
            />
          </div>

          {/* =========================
              MÔ TẢ
          ========================= */}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Mô tả
            </label>

            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nhập mô tả danh mục..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 transition-all shadow-2xs resize-none"
            />
          </div>

          {/* =========================
              TRẠNG THÁI
          ========================= */}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">
              Trạng thái
            </label>

            <div className="flex items-center gap-6">
              {/* ACTIVE */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="edit-status"
                  value="Active"
                  checked={status === "Active"}
                  onChange={() => setStatus("Active")}
                  className="w-4 h-4 accent-[#FF5E14] cursor-pointer"
                />

                <span className="text-sm font-bold text-slate-800">Active</span>
              </label>

              {/* DISABLED */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="edit-status"
                  value="Disabled"
                  checked={status === "Disabled"}
                  onChange={() => setStatus("Disabled")}
                  className="w-4 h-4 accent-[#FF5E14] cursor-pointer"
                />

                <span className="text-sm font-medium text-slate-600">
                  Disabled
                </span>
              </label>
            </div>
          </div>

          {/* =========================
              FOOTER
          ========================= */}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm transition-colors cursor-pointer shadow-2xs"
            >
              Hủy
            </button>

            <button
              type="submit"
              disabled={updateCategory.isPending || uploadImage.isPending}
              className="px-6 py-2.5 rounded-xl bg-[#FF5E14] hover:bg-[#e6520f] active:scale-[0.98] text-white font-bold text-xs sm:text-sm shadow-md shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Lưu thay đổi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const EditCatalogModal: React.FC<EditCatalogModalProps> = ({
  isOpen,
  onClose,
  category,
}) => {
  if (!isOpen || !category) return null;

  return (
    <EditCatalogForm key={category.id} category={category} onClose={onClose} />
  );
};

export default EditCatalogModal;
