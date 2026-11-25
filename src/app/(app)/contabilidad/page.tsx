import ModulePage from "@/components/ModulePage";
export default function Page() {
  return <ModulePage moduleKey="contabilidad" title="Contabilidad" description="Facturas, pagos, cuentas, reportes y cierre." kpis={[
    { label: "Facturas", value: "34", hint: "Emitidas" },
    { label: "Por cobrar", value: "$5.852.000", hint: "Saldo pendiente" },
    { label: "Pagos", value: "28", hint: "Registrados" },
    { label: "Cierre", value: "Pendiente", hint: "Mes actual" },
  ]} />;
}
