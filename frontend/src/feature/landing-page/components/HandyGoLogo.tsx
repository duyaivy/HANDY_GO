import React from "react";

interface HandyGoLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  src?: string;
  className?: string;
}

export const HandyGoLogo: React.FC<HandyGoLogoProps> = ({
  size = "md",
  src = "/handygo-logo.svg", // <-- Bạn có thể đổi trực tiếp đường dẫn ảnh tại đây
  className = "",
}) => {
  const heightClasses = {
    sm: "h-9 sm:h-10",
    md: "h-11 sm:h-12",
    lg: "h-14 sm:h-16",
    xl: "h-18 sm:h-20",
  };

  return (
    <img
      src={src}
      alt="HandyGo Logo"
      onError={(e) => {
        // Tự động dùng ảnh dự phòng nếu chưa có file logo.png
        e.currentTarget.src = "/handygo-logo-horizontal.png";
      }}
      className={`${heightClasses[size]} w-auto object-contain transition-transform duration-200 hover:scale-[1.02] ${className}`}
      loading="eager"
    />
  );
};
