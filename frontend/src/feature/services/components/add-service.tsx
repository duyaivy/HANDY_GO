"use client";

import React, { useRef, useState } from "react";
import { ArrowUp, X, Wrench } from "lucide-react";
import { ServiceCategory } from "../types";
import { useCreateServiceMutation } from "../hooks/use-services";
import { useUploadImage } from "@/feature/uploads/hooks/use-upload";

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ServiceCategory[];
}

export default function AddServiceModal({
  isOpen,
  onClose,
  categories,
}: AddServiceModalProps) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const createService = useCreateServiceMutation();
  const uploadImage = useUploadImage();

  const isSubmitting = createService.isPending || uploadImage.isPending;

  if (!isOpen) return null;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.");
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
    setError("");

    const reader = new FileReader();

    reader.onloadend = () => {
      setPreviewImage(reader.result as string);
    };

    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) return;

    if (!name.trim()) {
      setError("Vui lòng nhập tên dịch vụ.");
      return;
    }

    if (!categoryId) {
      setError("Vui lòng chọn danh mục.");
      return;
    }

    setError("");

    try {
      let iconUrl: string | null = null;

      // 1. Upload ảnh trước nếu người dùng chọn ảnh
      if (selectedFile) {
        const uploadResponse = await uploadImage.mutateAsync(selectedFile);

        iconUrl = uploadResponse.payload.data.url;

        if (!iconUrl) {
          throw new Error("Không nhận được URL ảnh từ Backend.");
        }
      }

      // 2. Gọi API POST tạo Service
      await createService.mutateAsync({
        name: name.trim(),
        categoryId,
        description: description.trim() || null,
        iconUrl,
        isActive,
      });

      // 3. Reset form sau khi thành công
      setName("");
      setCategoryId("");
      setDescription("");
      setPreviewImage("");
      setSelectedFile(null);
      setIsActive(true);
      setError("");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // 4. Đóng modal
      onClose();
    } catch (error) {
      console.error("Lỗi thêm dịch vụ:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Thêm dịch vụ thất bại. Vui lòng thử lại.",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <button
        type="button"
        aria-label="Đóng modal"
        onClick={onClose}
        disabled={isSubmitting}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
      />

      <div className="relative z-10 my-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-slate-900">Thêm dịch vụ</h2>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* HÌNH ẢNH */}
          <div>
            <label className="mb-2 block text-xs font-bold text-slate-700">
              Hình ảnh
            </label>

            <div className="flex items-center gap-3">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-orange-200 bg-[#FFF9F5] p-1">
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt="Ảnh dịch vụ"
                    className="h-full w-full rounded-xl object-cover"
                  />
                ) : (
                  <Wrench size={30} className="text-[#FF5E14]" />
                )}
              </div>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => fileInputRef.current?.click()}
                className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-orange-300 transition hover:bg-orange-50/40 disabled:opacity-50"
              >
                <ArrowUp className="h-4 w-4" />
                <span className="text-xs font-semibold text-slate-700">
                  Chọn ảnh
                </span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={isSubmitting}
                className="hidden"
              />
            </div>
          </div>

          {/* TÊN DỊCH VỤ */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">
              Tên dịch vụ <span className="text-rose-500">*</span>
            </label>

            <input
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSubmitting}
              placeholder="Nhập tên dịch vụ..."
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:opacity-50"
            />
          </div>

          {/* DANH MỤC */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">
              Danh mục <span className="text-rose-500">*</span>
            </label>

            <select
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-orange-500 disabled:opacity-50"
            >
              <option value="">Chọn danh mục</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {/* MÔ TẢ */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">
              Mô tả
            </label>

            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={isSubmitting}
              placeholder="Nhập mô tả dịch vụ..."
              className="w-full resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </div>

          {/* TRẠNG THÁI */}
          <div>
            <label className="mb-2 block text-xs font-bold text-slate-700">
              Trạng thái
            </label>

            <div className="flex items-center gap-6">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="add-service-status"
                  checked={isActive}
                  onChange={() => setIsActive(true)}
                  disabled={isSubmitting}
                  className="accent-[#FF5E14]"
                />
                <span className="text-sm">Active</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="add-service-status"
                  checked={!isActive}
                  onChange={() => setIsActive(false)}
                  disabled={isSubmitting}
                  className="accent-[#FF5E14]"
                />
                <span className="text-sm">Disabled</span>
              </label>
            </div>
          </div>

          {/* THÔNG BÁO LỖI */}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600"
            >
              {error}
            </p>
          )}

          {/* FOOTER */}
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Hủy
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-[#FF5E14] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#E9510D] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Thêm dịch vụ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
