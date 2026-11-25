import ModulePage from "@/components/ModulePage";
export default function Page() {
  return <ModulePage moduleKey="proyectos" title="Proyectos" description="Proyectos, tareas y Gantt." kpis={[
    { label: "Proyectos", value: "6", hint: "Activos" },
    { label: "Tareas", value: "42", hint: "En curso" },
    { label: "Completadas", value: "18", hint: "Esta semana" },
    { label: "Atrasadas", value: "3", hint: "Requieren atención" },
  ]} />;
}
