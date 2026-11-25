import ModulePage from "@/components/ModulePage";
export default function Page() {
  return <ModulePage moduleKey="crm" title="CRM" description="Leads, oportunidades, clientes y actividades." kpis={[
    { label: "Leads", value: "24", hint: "Nuevos este mes" },
    { label: "Oportunidades", value: "12", hint: "En pipeline" },
    { label: "Clientes", value: "38", hint: "Activos" },
    { label: "Conversión", value: "24%", hint: "+3 pts" },
  ]} />;
}
