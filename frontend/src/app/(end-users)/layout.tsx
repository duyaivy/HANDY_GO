// src/app/users/layout.tsx

export default function managerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main>{children}</main>;
}
