import React, { useState, useRef } from "react";
import { X, ArrowUp, ImageIcon, ChevronDown } from "lucide-react";
import { useCreateCategory } from "../hooks/use-categories";
import { useUploadImage } from "@/feature/uploads/hooks/use-upload";

export interface AddCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddCatalogModal: React.FC<AddCatalogModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"Active" | "Disabled">("Active");
  const [previewImage, setPreviewImage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const createCategory = useCreateCategory();
  const uploadImage = useUploadImage();

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP!");
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
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || createCategory.isPending || uploadImage.isPending) {
      return;
    }

    try {
      let imageUrl: string | null = null;

      // 1. Upload ảnh trước
      if (selectedFile) {
        const uploadResponse = await uploadImage.mutateAsync(selectedFile);

        imageUrl = uploadResponse.payload.data.url;

        if (!imageUrl) {
          throw new Error("Không nhận được URL ảnh từ Backend");
        }
      }

      // 2. Tạo danh mục
      const response = await createCategory.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        imageUrl,
        parentId: null,
        isActive: status === "Active",
      });

      // alert(response.payload.message || "Thêm danh mục thành công!");

      // 3. Reset form
      setName("");
      setDescription("");
      setStatus("Active");
      setPreviewImage("");
      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      onClose();
    } catch (error) {
      console.error("Lỗi thêm danh mục:", error);

      // alert(error instanceof Error ? error.message : "Thêm danh mục thất bại!");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      {/* Lớp phủ mờ nền đen */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* KHUNG MODAL POPUP THÊM DANH MỤC CHUẨN 100% THEO HÌNH MẪU */}
      <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-150 z-10 my-auto animate-in zoom-in-95 duration-200">
        {/* HEADER: Tiêu đề + Nút X */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Thêm danh mục</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FORM NHẬP LIỆU */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* PHẦN 1: HÌNH ẢNH (2 KHỐI VUÔNG: IMAGE & UPLOAD) */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">
              Hình ảnh
            </label>

            <div className="flex items-center gap-3">
              {/* Box 1: Xem trước ảnh (IMAGE) */}
              <div className="w-24 h-24 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center gap-1.5 overflow-hidden shrink-0 shadow-2xs">
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <ImageIcon className="w-6 h-6 text-slate-400 stroke-[1.8]" />
                    <span className="text-[10px] font-bold tracking-wider text-slate-400">
                      IMAGE
                    </span>
                  </>
                )}
              </div>

              {/* Box 2: Nút Upload viền nét đứt cam */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-2xl border-2 border-dashed border-orange-300 hover:border-orange-500 bg-white hover:bg-orange-50/40 flex flex-col items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer group shadow-2xs"
              >
                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-[#FF5E14] group-hover:scale-105 transition-transform">
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </div>
                <span className="text-xs font-bold text-slate-700 group-hover:text-orange-600 transition-colors">
                  Upload
                </span>
              </button>

              {/* Input file ẩn */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* PHẦN 2: TÊN DANH MỤC * */}
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
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 transition-all shadow-2xs font-normal"
            />
          </div>

          {/* PHẦN 3: MÔ TẢ */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Mô tả
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nhập mô tả danh mục..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 transition-all shadow-2xs resize-none font-normal"
            />
          </div>

          {/* PHẦN 4: TRẠNG THÁI */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Trạng thái
            </label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "Active" | "Disabled")
                }
                className="w-full appearance-none px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 cursor-pointer shadow-2xs bg-white"
              >
                <option value="Active">● Active</option>
                <option value="Disabled">● Disabled</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* FOOTER: NÚT HỦY & NÚT THÊM DANH MỤC */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            {/* Nút Hủy */}
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm transition-colors cursor-pointer shadow-2xs"
            >
              Hủy
            </button>

            {/* Nút Thêm danh mục màu cam */}
            <button
              type="submit"
              disabled={createCategory.isPending || uploadImage.isPending}
              className="px-6 py-2.5 rounded-xl bg-[#FF5E14] hover:bg-[#e6520f] active:scale-[0.98] text-white font-bold text-xs sm:text-sm shadow-md shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50"
            > Thêm
              {/* {uploadImage.isPending
                ? "Đang tải ảnh..."
                : createCategory.isPending
                  ? "Đang thêm..."
                  : "Thêm danh mục"} */}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddCatalogModal;
