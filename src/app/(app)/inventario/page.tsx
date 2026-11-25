import ModulePage from "@/components/ModulePage";
export default function Page() {
  return <ModulePage moduleKey="inventario" title="Inventario" description="Productos, stock, movimientos y bodegas." kpis={[
    { label: "Productos", value: "128", hint: "Activos" },
    { label: "Stock bajo", value: "5", hint: "Requieren reposición" },
    { label: "Bodegas", value: "3", hint: "Operativas" },
    { label: "Movimientos", value: "42", hint: "Hoy" },
  ]} />;
}
