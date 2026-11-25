import ModulePage from "@/components/ModulePage";
export default function Page() {
  return <ModulePage moduleKey="rrhh" title="RRHH" description="Empleados, nómina, asistencias y novedades." kpis={[
    { label: "Empleados", value: "24", hint: "Activos" },
    { label: "Nómina", value: "$48.000.000", hint: "Mes actual" },
    { label: "Asistencias", value: "18", hint: "Hoy" },
    { label: "Novedades", value: "3", hint: "Pendientes" },
  ]} />;
}
