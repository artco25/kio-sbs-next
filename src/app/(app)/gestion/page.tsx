import ModulePage from "@/components/ModulePage";
export default function Page() {
  return <ModulePage moduleKey="gestion" title="Gestión" description="Dashboard ejecutivo, reportes y KPIs." kpis={[
    { label: "Ingresos", value: "$36.652.000", hint: "+12%" },
    { label: "Pedidos", value: "48", hint: "Confirmados" },
    { label: "Clientes", value: "38", hint: "Activos" },
    { label: "Eficiencia", value: "92%", hint: "+2 pts" },
  ]} />;
}
