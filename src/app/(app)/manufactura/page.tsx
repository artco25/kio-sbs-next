import ModulePage from "@/components/ModulePage";
export default function Page() {
  return <ModulePage moduleKey="manufactura" title="Manufactura" description="Órdenes de producción, recetas y centros de trabajo." kpis={[
    { label: "Órdenes", value: "8", hint: "En producción" },
    { label: "Recetas", value: "15", hint: "Activas" },
    { label: "Centros", value: "4", hint: "Operativos" },
    { label: "Eficiencia", value: "92%", hint: "+2 pts" },
  ]} />;
}
