import ModulePage from "@/components/ModulePage";
export default function Page() {
  return <ModulePage moduleKey="administracion" title="Administración" description="Empresas, usuarios, roles y configuración." kpis={[
    { label: "Empresas", value: "1", hint: "Registradas" },
    { label: "Usuarios", value: "1", hint: "Activos" },
    { label: "Roles", value: "2", hint: "Configurados" },
    { label: "Módulos", value: "15", hint: "Disponibles" },
  ]} />;
}
