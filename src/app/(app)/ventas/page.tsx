import ModulePage from "@/components/ModulePage";
export default function Page() {
  return <ModulePage moduleKey="ventas" title="Ventas" description="Pedidos, cotizaciones, facturas y clientes." kpis={[
    { label: "Pedidos", value: "48", hint: "Confirmados" },
    { label: "Cotizaciones", value: "12", hint: "4 pendientes" },
    { label: "Facturado", value: "$30.800.000", hint: "Periodo actual" },
    { label: "Ticket medio", value: "$641.000", hint: "+5%" },
  ]} />;
}
