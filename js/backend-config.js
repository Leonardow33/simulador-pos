/* ==========================================================
   Conexión al backend (Supabase).
   Si url o anonKey están vacíos, la app funciona en "modo local"
   (sincroniza solo entre pestañas del mismo navegador).

   La clave "anon/publishable" es pública por diseño: el acceso
   lo controlan las políticas RLS definidas en supabase/schema.sql.
   NUNCA pegues aquí la clave "service_role" / "secret".
   ========================================================== */
window.BACKEND = {
  url: 'https://injpiudeoypgciqebipg.supabase.co',
  anonKey: 'sb_publishable_oQfLhFFjrhyYwGo2zkfFfQ_FBNUeJqh',
};
