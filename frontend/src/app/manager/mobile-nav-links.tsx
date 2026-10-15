import React from "react";
import { manageMenuItems } from "./menu-items";

export interface MobileNavLinksProps {
  onItemClick?: () => void;
}

export const MobileNavLinks: React.FC<MobileNavLinksProps> = ({
  onItemClick,
}) => {
  return (
    <nav className="flex flex-col space-y-1">
      {manageMenuItems.map((item) => (
        <a
          key={item.href}
          href={item.href}
          onClick={onItemClick}
          className="px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:text-orange-600 hover:bg-orange-50 transition-colors"
        >
          {item.title}
        </a>
      ))}
    </nav>
  );
};
export default MobileNavLinks;
