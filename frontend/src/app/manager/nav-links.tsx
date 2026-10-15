import React from "react";
import { manageMenuItems } from "./menu-items";

export const NavLinks: React.FC = () => {
  return (
    <nav className="flex items-center gap-1">
      {manageMenuItems.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          {item.title}
        </a>
      ))}
    </nav>
  );
};
export default NavLinks;
