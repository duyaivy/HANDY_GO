
"use client";

import React, { useRef, useState } from "react";
import { ArrowUp, X, Wrench } from "lucide-react";
import { ServiceCategory, ServiceFormData } from "../types";

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ServiceCategory[];
  onAdd: (data: ServiceFormData) => void;
}

export default function AddServiceModal({
  isOpen,
  onClose,
  categories,
  onAdd,
}: AddServiceModalProps) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn file hình ảnh.");
      return;
    }

    const reader = new FileReader();

    reader.onloadend = () => {
      setIconUrl(reader.result as string);
      setError("");
    };

    reader.readAsDataURL(file);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim()) {
      setError("Vui lòng nhập tên dịch vụ.");
      return;
    }

    if (!categoryId) {
      setError("Vui lòng chọn danh mục.");
      return;
    }

    onAdd({
      name: name.trim(),
      categoryId,
      description: description.trim() || null,
      iconUrl: iconUrl || null,
      isActive,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <button
        type="button"
        aria-label="Đóng modal"
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
      />

      <div className="relative z-10 my-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-slate-900">
            Thêm dịch vụ
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-2 block text-xs font-bold text-slate-700">
              Hình ảnh
            </label>

            <div className="flex items-center gap-3">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-orange-200 bg-[#FFF9F5] p-1">
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt="Ảnh dịch vụ"
                    className="h-full w-full rounded-xl object-cover"
                  />
                ) : (
                  <Wrench size={30} className="text-[#FF5E14]" />
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-orange-300 transition hover:bg-orange-50/40"
              >
                <ArrowUp className="h-4 w-4" />
                <span className="text-xs font-semibold text-slate-700">
                  Chọn ảnh
                </span>
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

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">
              Tên dịch vụ <span className="text-rose-500">*</span>
            </label>

            <input
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nhập tên dịch vụ..."
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">
              Danh mục <span className="text-rose-500">*</span>
            </label>

            <select
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-orange-500"
            >
              <option value="">Chọn danh mục</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">
              Mô tả
            </label>

            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Nhập mô tả dịch vụ..."
              className="w-full resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-orange-500"
            />
          </div>

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
                  className="accent-[#FF5E14]"
                />
                <span className="text-sm">Disabled</span>
              </label>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Hủy
            </button>

            <button
              type="submit"
              className="rounded-xl bg-[#FF5E14] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#E9510D]"
            >
              Thêm dịch vụ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
