import ModulePage from "@/components/ModulePage";
export default function Page() {
  return <ModulePage moduleKey="compras" title="Compras" description="Órdenes, proveedores y recepciones." kpis={[
    { label: "Órdenes", value: "15", hint: "Abiertas" },
    { label: "Proveedores", value: "8", hint: "Activos" },
    { label: "Por recibir", value: "3", hint: "Pendientes" },
    { label: "Total compras", value: "$12.400.000", hint: "Mes actual" },
  ]} />;
}
