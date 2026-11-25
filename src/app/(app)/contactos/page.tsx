import ModulePage from "@/components/ModulePage";
export default function Page() {
  return <ModulePage moduleKey="contactos" title="Contactos" description="Contactos y empresas." kpis={[
    { label: "Contactos", value: "120", hint: "Registrados" },
    { label: "Empresas", value: "38", hint: "Activas" },
    { label: "Nuevos", value: "8", hint: "Esta semana" },
    { label: "Inactivos", value: "3", hint: "Sin actividad" },
  ]} />;
}
