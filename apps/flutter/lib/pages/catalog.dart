import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../services/session.dart';
import '../theme/kio_theme.dart';
import 'comercial_pages.dart';
import 'dashboard_page.dart';
import 'finance_pages.dart';
import 'hr_pages.dart';
import 'pos_pages.dart';
import 'system_pages.dart';

/// Módulo navegable de KIO SBS (equivalente reducido de cada addon artix_*).
class Module {
  const Module(this.key, this.label, this.icon, this.color, this.suite, this.builder, this.visible);
  final String key;
  final String label;
  final IconData icon;
  final Color color;
  final Suite suite;
  final WidgetBuilder builder;
  final bool Function(Session) visible;
}

bool _all(Session s) => true;

final kModules = <Module>[
  // Inicio — Panel KIO (artix_brand)
  Module('panel', 'Panel', LucideIcons.layoutDashboard, Kio.navy, Suite.inicio, (_) => const DashboardPage(), _all),

  // Eje 1: Comercial (sale, stock, contacts, artix_cartera)
  Module('contactos', 'Contactos', LucideIcons.userRound, Kio.green, Suite.comercial, (_) => const PartnersPage(), (s) => s.canRead('partners')),
  Module('productos', 'Productos e inventario', LucideIcons.package, Kio.warning, Suite.comercial, (_) => const ProductsPage(), (s) => s.canRead('products')),
  Module('pedidos', 'Pedidos de venta', LucideIcons.shoppingBag, Kio.green, Suite.comercial, (_) => const OrdersPage(), (s) => s.canRead('sales')),
  Module('cartera', 'Cartera', LucideIcons.handCoins, Kio.info, Suite.comercial, (_) => const ReceivablesPage(), (s) => s.canRead('sales')),

  // Eje 2: Punto de venta (artix_pos, artix_kds)
  Module('caja', 'Caja POS', LucideIcons.store, Kio.warning, Suite.pos, (_) => const PosPage(), (s) => s.canWrite('pos_sessions')),
  Module('sesiones', 'Sesiones de caja', LucideIcons.calculator, Kio.navy, Suite.pos, (_) => const PosSessionsPage(), (s) => s.canRead('pos_sessions')),
  Module('cocina', 'Pantalla de cocina', LucideIcons.chefHat, Kio.danger, Suite.pos, (_) => const KdsPage(), (s) => s.isRestaurant && s.canWrite('sales')),

  // Eje 3: Financiero (artix_tesoreria, artix_caja_menor, artix_informes)
  Module('recibos', 'Recibos de caja', LucideIcons.receiptText, Kio.info, Suite.financiero, (_) => const PaymentsPage(), (s) => s.canRead('payments')),
  Module('caja_menor', 'Caja menor y gastos', LucideIcons.wallet, Kio.purple, Suite.financiero, (_) => const ExpensesPage(), (s) => s.canRead('expenses')),
  Module('informes', 'Informes', LucideIcons.chartColumn, Kio.navy, Suite.financiero, (_) => const ReportsPage(), (s) => s.isFinance),

  // Eje 4: Personal y nómina (artix_nomina, artix_autogestion)
  Module('empleados', 'Empleados', LucideIcons.idCard, Kio.purple, Suite.personal, (_) => const EmployeesPage(), (s) => s.canRead('employees')),
  Module('novedades', 'Novedades', LucideIcons.clipboardList, Kio.warning, Suite.personal, (_) => const NoveltiesPage(), (s) => s.canRead('payroll_novelties')),
  Module('ausencias', 'Vacaciones y permisos', LucideIcons.calendarDays, Kio.info, Suite.personal, (_) => const LeavesPage(), (s) => s.canRead('leave_requests')),
  Module('nomina', 'Liquidación de nómina', LucideIcons.banknote, Kio.green, Suite.personal, (_) => const PayrollPage(), (s) => s.canRead('payslips')),

  // Sistema
  Module('sync', 'Sincronización', LucideIcons.refreshCw, Kio.navy, Suite.sistema, (_) => const SyncPage(), _all),
  Module('usuarios', 'Usuarios y roles', LucideIcons.users, Kio.purple, Suite.sistema, (_) => const UsersPage(), (s) => s.isAdmin),
  Module('empresa', 'Empresa', LucideIcons.building2, Kio.muted, Suite.sistema, (_) => const CompanyPage(), (s) => s.isAdmin),
];
