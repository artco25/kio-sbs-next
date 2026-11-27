import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// Tokens de KIO SBS — paleta índigo #1E1B4B · #4338CA · #6366F1 · #A5B4FC · #E0E7FF · #F8FAFF
/// (misma que el admin web en kio-sbs-ft/admin/src/index.css).
class Kio {
  // Marca
  static const navy = Color(0xFF4338CA); // primario índigo
  static const navyDark = Color(0xFF1E1B4B);
  static const green = Color(0xFF16A34A);
  static const periwinkle = Color(0xFFE0E7FF);
  static const cyan = Color(0xFFA5B4FC);
  static const brandSecondary = Color(0xFF6366F1);
  static const brandLight = Color(0xFFEEF0FF);

  // Estados
  static const info = Color(0xFF0284C7);
  static const warning = Color(0xFFD97706);
  static const danger = Color(0xFFDC2626);
  static const purple = Color(0xFF7C3AED);

  // Texto y superficies
  static const text = Color(0xFF3B3A63);
  static const textStrong = Color(0xFF1E1B4B);
  static const muted = Color(0xFF6B6F8E);
  static const subtle = Color(0xFFA3A6C2);
  static const border = Color(0xFFECEEFB);
  static const borderStrong = Color(0xFFDFE2F5);
  static const bg = Color(0xFFF8FAFF);
  static const surface = Colors.white;
  static const grid = Color(0xFFF1F3FE);

  static const radius = 18.0;
  static const radiusSm = 12.0;

  static const shadow = [BoxShadow(color: Color(0x1A4338CA), blurRadius: 24, spreadRadius: -12, offset: Offset(0, 10))];

  static const heading = 'Montserrat';

  static TextStyle title([double size = 30]) =>
      TextStyle(fontFamily: heading, fontSize: size, fontWeight: FontWeight.w800, color: textStrong, letterSpacing: -0.4);

  static TextStyle h2([double size = 17]) =>
      TextStyle(fontFamily: heading, fontSize: size, fontWeight: FontWeight.w700, color: textStrong);

  static const label = TextStyle(fontSize: 13, color: muted);
  static const small = TextStyle(fontSize: 12, color: muted);
  static const tableHead = TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: muted, letterSpacing: 0.6);

  /// Tinte suave para fondos de íconos, pastillas y chips.
  static Color tint(Color c, [double a = 0.12]) => c.withValues(alpha: a);

  // ---- Caja POS (modo oscuro, derivado del índigo de marca)
  static const posBg = Color(0xFF12102B);
  static const posPanel = Color(0xFF1B1940);
  static const posCard = Color(0xFF26234F);
  static const posBorder = Color(0xFF38356B);
  static const posText = Color(0xFFF1F2FF);
  static const posMuted = Color(0xFFA9ADD6);

  /// Colores pastel (tomados de la paleta índigo + acentos suaves) para las categorías.
  static const posPastels = [
    Color(0xFFE0E7FF), // periwinkle
    Color(0xFFE6D7F5), // lila
    Color(0xFFC9DDF2), // celeste
    Color(0xFFD5D3F7), // índigo claro
    Color(0xFFF8C9DD), // rosa
    Color(0xFFD3EFE3), // menta
    Color(0xFFF6DDC8), // durazno
    Color(0xFFC7E8E4), // turquesa suave
  ];

  static ThemeData posTheme() {
    final base = theme();
    final scheme = ColorScheme.fromSeed(seedColor: navy, brightness: Brightness.dark, primary: brandSecondary, surface: posPanel, error: danger);
    final outline = OutlineInputBorder(borderRadius: BorderRadius.circular(radiusSm), borderSide: const BorderSide(color: posBorder));
    return base.copyWith(
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: posBg,
      dividerColor: posBorder,
      dividerTheme: const DividerThemeData(color: posBorder, space: 1, thickness: 1),
      textTheme: base.textTheme.copyWith(
        bodyMedium: const TextStyle(fontSize: 14, color: posText),
        bodySmall: const TextStyle(fontSize: 12, color: posMuted),
        titleMedium: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: posText),
      ),
      inputDecorationTheme: base.inputDecorationTheme.copyWith(
        fillColor: posCard,
        hintStyle: const TextStyle(color: posMuted, fontSize: 14),
        labelStyle: const TextStyle(color: posMuted, fontSize: 14),
        prefixIconColor: posMuted,
        border: outline,
        enabledBorder: outline,
        focusedBorder: outline.copyWith(borderSide: const BorderSide(color: cyan, width: 1.4)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: brandSecondary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: posCard,
          disabledForegroundColor: posMuted,
          minimumSize: const Size(0, 42),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, fontFamily: 'Inter'),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusSm)),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(foregroundColor: posText)),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: cyan, textStyle: const TextStyle(fontWeight: FontWeight.w600, fontFamily: 'Inter'))),
      checkboxTheme: CheckboxThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)), side: const BorderSide(color: posMuted, width: 1.4)),
      dialogTheme: DialogThemeData(backgroundColor: posPanel, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18))),
      chipTheme: ChipThemeData(backgroundColor: posCard, side: const BorderSide(color: posBorder), labelStyle: const TextStyle(color: posText)),
    );
  }

  static ThemeData theme() {
    final scheme = ColorScheme.fromSeed(
      seedColor: navy,
      primary: navy,
      secondary: green,
      error: danger,
      surface: surface,
    );
    final outline = OutlineInputBorder(
      borderRadius: BorderRadius.circular(radiusSm),
      borderSide: const BorderSide(color: borderStrong),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: 'Inter',
      scaffoldBackgroundColor: bg,
      dividerColor: border,
      dividerTheme: const DividerThemeData(color: border, space: 1, thickness: 1),
      textTheme: const TextTheme(
        bodyMedium: TextStyle(fontSize: 14, color: text),
        bodySmall: TextStyle(fontSize: 12, color: muted),
        titleMedium: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: textStrong),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: surface,
        foregroundColor: textStrong,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      inputDecorationTheme: InputDecorationTheme(
        isDense: true,
        filled: true,
        fillColor: surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        hintStyle: const TextStyle(color: subtle, fontSize: 14),
        labelStyle: const TextStyle(color: muted, fontSize: 14),
        border: outline,
        enabledBorder: outline,
        focusedBorder: outline.copyWith(borderSide: const BorderSide(color: navy, width: 1.4)),
        errorBorder: outline.copyWith(borderSide: const BorderSide(color: danger)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: navy,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 42),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, fontFamily: 'Inter'),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusSm)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: textStrong,
          minimumSize: const Size(0, 40),
          side: const BorderSide(color: borderStrong),
          padding: const EdgeInsets.symmetric(horizontal: 14),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, fontFamily: 'Inter'),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusSm)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: navy, textStyle: const TextStyle(fontWeight: FontWeight.w600, fontFamily: 'Inter')),
      ),
      checkboxTheme: CheckboxThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        side: const BorderSide(color: Color(0xFFC5CCD6), width: 1.4),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: textStrong,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusSm)),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(color: textStrong, borderRadius: BorderRadius.circular(6)),
        textStyle: const TextStyle(color: Colors.white, fontSize: 12, fontFamily: 'Inter'),
      ),
    );
  }
}

/// Paleta de la caja POS: claro (por defecto) u oscuro.
class PosPal {
  const PosPal({required this.dark, required this.bg, required this.panel, required this.card, required this.border, required this.text, required this.muted, required this.accent, required this.pill, required this.pillText, required this.cta});
  final bool dark;
  final Color bg, panel, card, border, text, muted, accent, pill, pillText, cta;

  static const light = PosPal(
    dark: false,
    bg: Color(0xFFF4F5FB),
    panel: Colors.white,
    card: Colors.white,
    border: Color(0xFFE3E5F3),
    text: Kio.navyDark,
    muted: Kio.muted,
    accent: Kio.navy,
    pill: Kio.navyDark,
    pillText: Colors.white,
    cta: Kio.navyDark,
  );
  static const darkPal = PosPal(
    dark: true,
    bg: Kio.posBg,
    panel: Kio.posPanel,
    card: Kio.posCard,
    border: Kio.posBorder,
    text: Kio.posText,
    muted: Kio.posMuted,
    accent: Kio.cyan,
    pill: Kio.posCard,
    pillText: Kio.posText,
    cta: Kio.green,
  );
  static PosPal of(BuildContext c) => Theme.of(c).brightness == Brightness.dark ? darkPal : light;
}

/// Las 4 suites de KIO SBS (+ inicio y sistema), con su color e ícono Lucide.
class Suite {
  final String key;
  final String name;
  final IconData icon;
  final Color color;
  const Suite(this.key, this.name, this.icon, this.color);

  static const inicio = Suite('inicio', 'Inicio', LucideIcons.layoutDashboard, Kio.navy);
  static const comercial = Suite('comercial', 'Comercial', LucideIcons.shoppingBag, Kio.green);
  static const pos = Suite('pos', 'Punto de venta', LucideIcons.store, Kio.warning);
  static const financiero = Suite('financiero', 'Financiero', LucideIcons.landmark, Kio.info);
  static const personal = Suite('personal', 'Personal y nómina', LucideIcons.idCard, Kio.purple);
  static const sistema = Suite('sistema', 'Sistema', LucideIcons.settings, Kio.muted);

  static const all = [inicio, comercial, pos, financiero, personal, sistema];
}
