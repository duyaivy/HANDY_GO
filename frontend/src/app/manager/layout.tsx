// src/app/manager/layout.tsx

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main>
      <h2>HandyGo Admin</h2>
      {children}
    </main>
  );
}