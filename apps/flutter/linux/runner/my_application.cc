#include "my_application.h"

#include <flutter_linux/flutter_linux.h>

#include "flutter/generated_plugin_registrant.h"

struct _MyApplication {
  GtkApplication parent_instance;
  char** dart_entrypoint_arguments;
};

G_DEFINE_TYPE(MyApplication, my_application, GTK_TYPE_APPLICATION)

// Called when first Flutter frame received. The window is mapped here, so this
// is the first reliable moment to give keyboard focus to the Flutter view.
static void first_frame_cb(MyApplication* self, FlView* view) {
  GtkWidget* toplevel = gtk_widget_get_toplevel(GTK_WIDGET(view));
  gtk_widget_show(toplevel);
  gtk_window_present(GTK_WINDOW(toplevel));
  gtk_widget_set_can_focus(GTK_WIDGET(view), TRUE);
  gtk_widget_grab_focus(GTK_WIDGET(view));
  gtk_window_set_focus(GTK_WINDOW(toplevel), GTK_WIDGET(view));
}

static void toggle_maximize(GtkWindow* window) {
  if (gtk_window_is_maximized(window)) {
    gtk_window_unmaximize(window);
  } else {
    gtk_window_maximize(window);
  }
}

// Some window managers focus the titlebar instead of the client area when the
// app regains focus. Keep keyboard events going to Flutter.
static gboolean ensure_view_focus_cb(GtkWidget* widget, GdkEventFocus* event, gpointer data) {
  (void)widget;
  (void)event;
  gtk_widget_grab_focus(GTK_WIDGET(data));
  return FALSE;
}

// Implements GApplication::activate.
static void my_application_activate(GApplication* application) {
  MyApplication* self = MY_APPLICATION(application);
  GtkWindow* window =
      GTK_WINDOW(gtk_application_window_new(GTK_APPLICATION(application)));

  // Cabecera propia con botones explícitos: algunos administradores de
  // ventanas (GNOME/tiling) no muestran minimizar/maximizar por defecto.
  GtkHeaderBar* header_bar = GTK_HEADER_BAR(gtk_header_bar_new());
  gtk_header_bar_set_title(header_bar, "KIO SBS");
  gtk_header_bar_set_subtitle(header_bar, "Punto de venta");
  gtk_header_bar_set_show_close_button(header_bar, FALSE);

  GtkWidget* controls = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
  GtkWidget* minimize = gtk_button_new_from_icon_name("window-minimize-symbolic", GTK_ICON_SIZE_BUTTON);
  GtkWidget* maximize = gtk_button_new_from_icon_name("window-maximize-symbolic", GTK_ICON_SIZE_BUTTON);
  GtkWidget* close = gtk_button_new_from_icon_name("window-close-symbolic", GTK_ICON_SIZE_BUTTON);
  gtk_widget_set_tooltip_text(minimize, "Minimizar");
  gtk_widget_set_tooltip_text(maximize, "Maximizar / restaurar");
  gtk_widget_set_tooltip_text(close, "Cerrar");
  // Evita que los botones de la cabecera roben el foco al abrir la app.
  gtk_widget_set_can_focus(minimize, FALSE);
  gtk_widget_set_can_focus(maximize, FALSE);
  gtk_widget_set_can_focus(close, FALSE);
  g_signal_connect_swapped(minimize, "clicked", G_CALLBACK(gtk_window_iconify), window);
  g_signal_connect_swapped(maximize, "clicked", G_CALLBACK(toggle_maximize), window);
  g_signal_connect_swapped(close, "clicked", G_CALLBACK(gtk_window_close), window);
  gtk_box_pack_start(GTK_BOX(controls), minimize, FALSE, TRUE, 0);
  gtk_box_pack_start(GTK_BOX(controls), maximize, FALSE, TRUE, 0);
  gtk_box_pack_start(GTK_BOX(controls), close, FALSE, TRUE, 0);
  gtk_header_bar_pack_end(header_bar, controls);
  gtk_widget_show_all(controls);
  gtk_widget_show(GTK_WIDGET(header_bar));
  gtk_window_set_title(window, "KIO SBS");
  gtk_window_set_titlebar(window, GTK_WIDGET(header_bar));
  gtk_window_set_focus_on_map(window, TRUE);

  // Load window icon from bundle data dir (installed by CMake).
  g_autofree gchar* exe_path = g_file_read_link("/proc/self/exe", nullptr);
  if (exe_path != nullptr) {
    g_autofree gchar* exe_dir = g_path_get_dirname(exe_path);
    g_autofree gchar* icon_path =
        g_build_filename(exe_dir, "data", "app_icon.png", nullptr);
    if (g_file_test(icon_path, G_FILE_TEST_EXISTS)) {
      gtk_window_set_icon_from_file(window, icon_path, nullptr);
    }
  }

  gtk_window_set_default_size(window, 1280, 720);

  g_autoptr(FlDartProject) project = fl_dart_project_new();
  fl_dart_project_set_dart_entrypoint_arguments(
      project, self->dart_entrypoint_arguments);

  FlView* view = fl_view_new(project);
  GdkRGBA background_color;
  // Background defaults to black, override it here if necessary, e.g. #00000000
  // for transparent.
  gdk_rgba_parse(&background_color, "#000000");
  fl_view_set_background_color(view, &background_color);
  gtk_widget_show(GTK_WIDGET(view));
  gtk_container_add(GTK_CONTAINER(window), GTK_WIDGET(view));
  g_signal_connect(window, "focus-in-event", G_CALLBACK(ensure_view_focus_cb), view);

  // Show the window when Flutter renders.
  // Requires the view to be realized so we can start rendering.
  g_signal_connect_swapped(view, "first-frame", G_CALLBACK(first_frame_cb),
                           self);
  gtk_widget_realize(GTK_WIDGET(view));

  fl_register_plugins(FL_PLUGIN_REGISTRY(view));
}

// Implements GApplication::local_command_line.
static gboolean my_application_local_command_line(GApplication* application,
                                                  gchar*** arguments,
                                                  int* exit_status) {
  MyApplication* self = MY_APPLICATION(application);
  // Strip out the first argument as it is the binary name.
  self->dart_entrypoint_arguments = g_strdupv(*arguments + 1);

  g_autoptr(GError) error = nullptr;
  if (!g_application_register(application, nullptr, &error)) {
    g_warning("Failed to register: %s", error->message);
    *exit_status = 1;
    return TRUE;
  }

  g_application_activate(application);
  *exit_status = 0;

  return TRUE;
}

// Implements GApplication::startup.
static void my_application_startup(GApplication* application) {
  // MyApplication* self = MY_APPLICATION(object);

  // Perform any actions required at application startup.

  G_APPLICATION_CLASS(my_application_parent_class)->startup(application);
}

// Implements GApplication::shutdown.
static void my_application_shutdown(GApplication* application) {
  // MyApplication* self = MY_APPLICATION(object);

  // Perform any actions required at application shutdown.

  G_APPLICATION_CLASS(my_application_parent_class)->shutdown(application);
}

// Implements GObject::dispose.
static void my_application_dispose(GObject* object) {
  MyApplication* self = MY_APPLICATION(object);
  g_clear_pointer(&self->dart_entrypoint_arguments, g_strfreev);
  G_OBJECT_CLASS(my_application_parent_class)->dispose(object);
}

static void my_application_class_init(MyApplicationClass* klass) {
  G_APPLICATION_CLASS(klass)->activate = my_application_activate;
  G_APPLICATION_CLASS(klass)->local_command_line =
      my_application_local_command_line;
  G_APPLICATION_CLASS(klass)->startup = my_application_startup;
  G_APPLICATION_CLASS(klass)->shutdown = my_application_shutdown;
  G_OBJECT_CLASS(klass)->dispose = my_application_dispose;
}

static void my_application_init(MyApplication* self) {}

MyApplication* my_application_new() {
  // Set the program name to the application ID, which helps various systems
  // like GTK and desktop environments map this running application to its
  // corresponding .desktop file. This ensures better integration by allowing
  // the application to be recognized beyond its binary name.
  g_set_prgname(APPLICATION_ID);

  return MY_APPLICATION(g_object_new(my_application_get_type(),
                                     "application-id", APPLICATION_ID, "flags",
                                     G_APPLICATION_NON_UNIQUE, nullptr));
}
