/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Definición de la navegación del shell autenticado.
 *
 * Vivía dentro de `app/(app)/layout.tsx` (client component de ~900 líneas), lo
 * que la hacía imposible de testear sin montar React: los guards solo podían
 * hacer regex sobre el archivo. Extraída aquí como funciones PURAS, el árbol de
 * navegación es dato verificable — ver `sidebar-nav.test.ts`, que comprueba que
 * ningún módulo declare un `group:` inexistente para el rol que exige (el bug
 * que dejó "Puntos y retos" invisible para los tenant_admin).
 *
 * Dos árboles distintos:
 *   - `buildGroups`   → menú principal de la app.
 *   - `buildAdminGroups` → área de administración (`/admin`, `/super`), que
 *     REEMPLAZA al principal cuando el admin entra ahí.
 *
 * Los labels de grupo son CONTRATO con los módulos: `mergeExtensionSidebarItems`
 * inserta cada `sidebarItem` en el grupo cuyo label coincide con su `group:`, y
 * descarta en silencio los que no casan. Renombrar un grupo obliga a actualizar
 * los módulos que apuntan a él EN EL MISMO COMMIT.
 */

import type { SidebarGroup } from '@/components/app-sidebar';

export function buildGroups({
  isAdminOrFormador,
  isAdmin,
  espacios,
}: {
  isAdminOrFormador: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  espacios: SidebarGroup;
}): SidebarGroup[] {
  // ── Inicio ─────────────────────────────────────────────────────────────────
  const inicio: SidebarGroup = {
    label: 'Inicio',
    icon: 'home',
    items: [
      { href: '/comunidad', label: 'Feed de la comunidad', icon: 'globe', exactMatch: true },
      { href: '/inicio/mi-panel', label: 'Mi panel', icon: 'chart', exactMatch: true },
    ],
  };

  // ── Aprendizaje ────────────────────────────────────────────────────────────
  const aprendizaje: SidebarGroup = {
    label: 'Aprendizaje',
    icon: 'book',
    // "Rutas de aprendizaje" se ocultó del menú por ahora (mismo criterio que
    // /grupos en el bloque 9): la ruta /rutas sigue viva y el formador conserva
    // "Mis rutas", solo desaparece la entrada del alumno.
    items: [
      { href: '/cursos', label: 'Cursos', icon: 'book' },
      { href: '/mis-certificados', label: 'Certificados', icon: 'award' },
    ],
  };

  // ── Agenda ─────────────────────────────────────────────────────────────────
  // Bloque 9: "Eventos en directo" se fusionó con el calendario (pestaña
  // "Eventos" en /calendario; /eventos redirige allí). El grupo "Grupos" se
  // ocultó del menú mientras la feature no esté activa — la ruta /grupos sigue
  // existiendo, solo desaparece la entrada (un menú vacío es peor que ninguno).
  const agenda: SidebarGroup = {
    label: 'Agenda',
    icon: 'calendar',
    items: [{ href: '/calendario', label: 'Calendario', icon: 'calendar' }],
  };

  // ── Personas ───────────────────────────────────────────────────────────────
  const personas: SidebarGroup = {
    label: 'Personas',
    icon: 'users',
    items: [
      { href: '/miembros', label: 'Miembros', icon: 'users' },
      // 'Clasificación' y 'Retos' los aporta la extensión de mod.gamification,
      // así desaparecen si el tenant desactiva el módulo (el /leaderboard
      // anterior era fijo y se quedaba vacío).
      { href: '/mensajes', label: 'Mensajes', icon: 'messages' },
      { href: '/referidos', label: 'Referidos', icon: 'sparkles' },
    ],
  };

  if (!isAdminOrFormador) {
    return [inicio, espacios, aprendizaje, agenda, personas];
  }

  // ── Profesor ───────────────────────────────────────────────────────────────
  // El item "Aula virtual" del módulo `mod.zoom-live` y "Correcciones" de
  // `mod.ai-grader` NO se hardcodean acá — los aporta cada extensión vía
  // `moduleExtensions[].sidebarItems`. El core no debe conocer features de
  // un módulo (rompe el contrato de módulo).
  const profesor: SidebarGroup = {
    // El label DEBE ser 'Formador' (no 'Profesor'): es la clave por la que
    // `mergeExtensionSidebarItems` inserta los items de extensión de los módulos
    // (zoom-live → Aula virtual, certificates → Plantillas certificado, …), que
    // declaran `group: 'Formador'`. Con 'Profesor' el merge no casaba y esos
    // items se caían silenciosamente (features huérfanas).
    label: 'Formador',
    icon: 'edit',
    items: [
      { href: '/formador', label: 'Panel', icon: 'chart', exactMatch: true },
      { href: '/formador/cursos', label: 'Mis cursos', icon: 'book' },
      { href: '/formador/rutas', label: 'Mis rutas', icon: 'route' },
      { href: '/formador/correcciones', label: 'Correcciones', icon: 'check' },
    ],
  };

  if (!isAdmin) {
    return [inicio, espacios, aprendizaje, agenda, personas, profesor];
  }

  // ── Administración (entrada) ─────────────────────────────────────────────
  // El admin tiene su PROPIA área (buildAdminGroups): el menú principal solo
  // muestra UNA entrada que lleva a /admin, donde el sidebar cambia a las
  // sub-secciones de administración. Así el rail principal no se satura con ~20
  // items. La etiqueta del grupo es 'Gestión' (NO 'Administración') a propósito:
  // así las extensiones de módulos que apuntan a 'Administración' NO se cuelan
  // en el menú principal — solo aparecen dentro del área admin.
  const entradaAdmin: SidebarGroup = {
    label: 'Gestión',
    icon: 'building',
    items: [{ href: '/admin', label: 'Administración', icon: 'building' }],
  };

  return [inicio, espacios, aprendizaje, agenda, personas, profesor, entradaAdmin];
}

/**
 * Visibilidad del menú por ROL (configurable en Admin → «Menú por rol»).
 *
 * El admin puede ocultar entradas del menú principal a un rol concreto (p.ej.
 * que el alumno no vea «Miembros»). La config vive en el tenant-setting
 * `nav/roleVisibility` = `{ [rol]: hrefsOcultos[] }`. El backend
 * (`GET /me/nav-hidden`) calcula, para el usuario que llama, los hrefs ocultos
 * (un href se oculta solo si lo está para TODOS sus roles) y NUNCA oculta nada
 * a super_admin/tenant_admin. El sidebar filtra con `filterGroupsByHiddenHrefs`.
 */

/**
 * Prefijo del centinela que oculta un GRUPO entero (no un item suelto). Se usa
 * para grupos cuyos items son dinámicos y no tienen un href fijo que apagar —
 * hoy 'Foros' (los espacios de comunidad). En el mapa se guarda como
 * `group:Foros`; el catálogo de Admin lo ofrece como una entrada más.
 */
export const GROUP_HIDE_PREFIX = 'group:';

/** Roles a los que el admin puede recortar el menú (los admin nunca se tocan). */
export const MENU_VISIBILITY_ROLES = [
  { key: 'alumno', label: 'Estudiante' },
  { key: 'formador', label: 'Formador' },
  { key: 'auditor', label: 'Auditor' },
  { key: 'empresa_manager', label: 'Empresa' },
] as const;

/**
 * Catálogo de entradas recortables del menú principal, agrupadas como en el
 * sidebar. Es la fuente de la matriz de la página de Admin. Debe reflejar los
 * items fijos de `buildGroups` más los de módulos que cuelgan del menú
 * principal (Retos, Clasificación). Foros/Espacios (dinámicos por espacio) y la
 * entrada de administración no se listan a propósito.
 */
export const MENU_VISIBILITY_CATALOG: {
  section: string;
  items: { href: string; label: string }[];
}[] = [
  {
    section: 'Inicio',
    items: [
      { href: '/comunidad', label: 'Feed de la comunidad' },
      { href: '/inicio/mi-panel', label: 'Mi panel' },
    ],
  },
  {
    // 'Foros' es un grupo con espacios dinámicos dentro: se oculta el grupo
    // entero con el centinela `group:Foros`, no un href suelto.
    section: 'Foros',
    items: [{ href: `${GROUP_HIDE_PREFIX}Foros`, label: 'Sección Foros (todos los espacios)' }],
  },
  {
    section: 'Aprendizaje',
    items: [
      { href: '/cursos', label: 'Cursos' },
      { href: '/mis-certificados', label: 'Certificados' },
      { href: '/retos', label: 'Retos' },
    ],
  },
  {
    section: 'Agenda',
    items: [{ href: '/calendario', label: 'Calendario' }],
  },
  {
    section: 'Personas',
    items: [
      { href: '/miembros', label: 'Miembros' },
      { href: '/leaderboard', label: 'Clasificación' },
      { href: '/mensajes', label: 'Mensajes' },
      { href: '/referidos', label: 'Referidos' },
    ],
  },
];

/**
 * Quita del árbol los items cuyo href está en `hidden`, los GRUPOS marcados con
 * `group:<label>`, y descarta los grupos que se quedan sin items. Puro: no muta
 * la entrada. Si `hidden` es null/vacío devuelve los grupos tal cual (primer
 * render, o sin config).
 */
export function filterGroupsByHiddenHrefs(
  groups: SidebarGroup[],
  hidden: Set<string> | null,
): SidebarGroup[] {
  if (!hidden || hidden.size === 0) return groups;
  return groups
    .filter((g) => !hidden.has(`${GROUP_HIDE_PREFIX}${g.label}`))
    .map((g) => ({ ...g, items: g.items.filter((it) => !hidden.has(it.href)) }))
    .filter((g) => g.items.length > 0 || g.canAdd);
}

/**
 * Enlace de vuelta al área de usuario. Antes era el primer ITEM del grupo
 * "General" — un control de navegación disfrazado de sección. Ahora lo pinta
 * el propio sidebar en la cabecera (`SidebarContent.backLink`).
 */
export const ADMIN_BACK_LINK = { href: '/comunidad', label: 'Volver a la app' } as const;

/** Rutas del área admin que muestran un badge con el trabajo pendiente. */
export const ADMIN_BADGE_ROUTES = {
  memberRequests: '/admin/solicitudes-miembros',
  arrears: '/admin/impagos',
} as const;

/**
 * Pinta los contadores de trabajo pendiente sobre los items correspondientes.
 * Muta los grupos en sitio (igual que `mergeExtensionSidebarItems`) y se aplica
 * al final del pipeline, para que también alcance a los items que aportan los
 * módulos. Un 0 no pinta nada — el sidebar ya ignora `badge <= 0`.
 */
export function applyAdminBadges(
  groups: SidebarGroup[],
  counts: { memberRequests: number; arrears: number },
): SidebarGroup[] {
  const byHref = new Map<string, number>([
    [ADMIN_BADGE_ROUTES.memberRequests, counts.memberRequests],
    [ADMIN_BADGE_ROUTES.arrears, counts.arrears],
  ]);
  for (const group of groups) {
    for (const item of group.items) {
      const count = byHref.get(item.href);
      if (count !== undefined && count > 0) item.badge = count;
    }
  }
  return groups;
}

/**
 * Sidebar del ÁREA de administración. Se usa cuando el pathname empieza por
 * `/admin` o `/super` (ver Shell): reemplaza al sidebar principal para que el
 * admin tenga su propio espacio.
 *
 * Criterio de agrupación: **el trabajo que estás haciendo**, no la tecnología
 * de debajo. Los grupos van ordenados por frecuencia de uso (Personas a diario,
 * Seguridad una vez al trimestre) y ninguno pasa de 4-5 items — por encima de
 * ahí un grupo deja de escanearse. Lo anterior era un cajón "General" de 14
 * items (40% del panel) que mezclaba analítica, personas, catálogo, marca y
 * configuración del sistema.
 *
 * ⚠️ Los labels son CONTRATO con los módulos: `mergeExtensionSidebarItems`
 * casa el `group:` de cada `sidebarItem` contra ellos y descarta en silencio lo
 * que no encuentra. Renombrar un grupo obliga a actualizar en el MISMO commit
 * los módulos que apuntan a él. `sidebar-nav.test.ts` lo verifica.
 *
 * ⚠️ Ningún label puede coincidir con uno de `buildGroups` (menú principal): un
 * item de módulo se insertaría en ambos árboles. Por eso 'Personas y accesos'
 * y no 'Personas'. También verificado en el test.
 */
export function buildAdminGroups({ isSuperAdmin }: { isSuperAdmin: boolean }): SidebarGroup[] {
  const resumen: SidebarGroup = {
    label: 'Resumen',
    icon: 'chart',
    items: [
      // Las métricas de negocio son la pestaña "Negocio" de este mismo panel
      // (/admin/metricas redirige allí): dos dashboards competiendo obligaban
      // a adivinar cuál abrir.
      { href: '/admin', label: 'Panel', icon: 'chart', exactMatch: true },
    ],
  };

  // Todo lo que es "un ser humano en la plataforma". Recibe 'Puntos y retos'
  // de mod.gamification — el engagement de miembros es gestión de personas, y
  // así espeja el menú principal, donde Clasificación y Retos cuelgan de
  // 'Personas'.
  const personas: SidebarGroup = {
    label: 'Personas y accesos',
    icon: 'users',
    items: [
      { href: '/admin/usuarios', label: 'Usuarios y roles', icon: 'users' },
      { href: '/admin/solicitudes-miembros', label: 'Solicitudes de inscripción', icon: 'user' },
      { href: '/admin/invitaciones', label: 'Invitaciones', icon: 'mail' },
      { href: '/admin/grupos-acceso', label: 'Grupos de acceso', icon: 'lock' },
    ],
  };

  const comunidad: SidebarGroup = {
    label: 'Comunidad',
    icon: 'hash',
    items: [
      { href: '/admin/comunidad/espacios', label: 'Espacios', icon: 'hash' },
      { href: '/admin/comunidad/tags', label: 'Tags', icon: 'message' },
      { href: '/admin/comunidad/publicaciones-api', label: 'Publicaciones API', icon: 'code' },
    ],
  };

  // Catálogo y su taxonomía. Antes estaba partido: categorías y competencias
  // en "General", tags y encuestas en "Comunidad", siendo todo lo mismo —
  // metadatos que cura el admin.
  const contenido: SidebarGroup = {
    label: 'Contenido',
    icon: 'book',
    items: [
      { href: '/admin/cursos/categorias', label: 'Categorías de cursos', icon: 'book' },
      { href: '/admin/competencias', label: 'Competencias', icon: 'award' },
      { href: '/admin/imagenes', label: 'Imágenes', icon: 'image' },
    ],
  };

  // Todo el dinero en un sitio. Estaba repartido en tres grupos: Membresía en
  // "General", Impagos/Referidos/Productos en "Facturación" y Conexiones de
  // pago en "Administración". 'Ingresos' y no 'Facturación' porque aquí no se
  // emite ninguna factura.
  const ingresos: SidebarGroup = {
    label: 'Ingresos',
    icon: 'briefcase',
    items: [
      { href: '/admin/membresia', label: 'Membresía', icon: 'sparkles' },
      { href: '/admin/impagos', label: 'Impagos', icon: 'alert' },
      { href: '/admin/referidos', label: 'Referidos', icon: 'trending' },
    ],
  };

  // Lo que sale hacia el usuario. Emails vivía en "General" y Avisos en
  // "Comunidad", siendo la misma cabeza: qué le llega al miembro.
  const comunicacion: SidebarGroup = {
    label: 'Comunicación',
    icon: 'mail',
    items: [
      { href: '/admin/emails', label: 'Emails', icon: 'mail' },
      { href: '/admin/avisos', label: 'Avisos', icon: 'megaphone' },
    ],
  };

  // "Dominios propios" es white-label, no una integración: va con Branding.
  const marca: SidebarGroup = {
    label: 'Marca y ajustes',
    icon: 'palette',
    items: [
      { href: '/admin/branding', label: 'Branding', icon: 'palette' },
      { href: '/admin/menu', label: 'Menú por rol', icon: 'eye' },
      { href: '/admin/dominios', label: 'Dominios propios', icon: 'globe' },
      { href: '/admin/configuracion', label: 'Configuración', icon: 'cog' },
    ],
  };

  // La documentación en vivo para integradores es la pestaña "Documentación" de
  // Claves API, y las entregas de Zoom la pestaña "Zoom" de Webhooks: un tema,
  // una entrada.
  const integraciones: SidebarGroup = {
    label: 'Integraciones y API',
    icon: 'package',
    items: [
      { href: '/admin/api-keys', label: 'Claves API', icon: 'code' },
      { href: '/admin/webhooks', label: 'Webhooks', icon: 'link' },
      { href: '/admin/rate-limit', label: 'Límites de API', icon: 'trending' },
      { href: '/admin/ia/providers', label: 'Proveedores de IA', icon: 'sparkles' },
    ],
  };

  // Las tres pantallas de SSO se fusionaron en /admin/sso con pestañas: ocupaban
  // 4 de los 6 huecos y empujaban hacia abajo la política MFA, que es lo único
  // que se toca de forma habitual.
  const seguridad: SidebarGroup = {
    label: 'Seguridad',
    icon: 'shield',
    items: [
      { href: '/admin/seguridad', label: 'Políticas de acceso', icon: 'shield' },
      // Features EE con UI: siempre visibles (patrón EeGate); el backend gatea.
      { href: '/admin/sso', label: 'Identidad (SSO)', icon: 'lock' },
      { href: '/admin/scim', label: 'Aprovisionamiento (SCIM)', icon: 'users' },
      { href: '/admin/auditoria', label: 'Auditoría', icon: 'eye' },
    ],
  };

  const groups: SidebarGroup[] = [
    resumen,
    personas,
    comunidad,
    contenido,
    ingresos,
    comunicacion,
    marca,
    integraciones,
    seguridad,
  ];

  if (isSuperAdmin) {
    // 'Plataforma', no 'Administración': dentro del área de administración ese
    // nombre no distinguía nada, y el grupo se había convertido en un segundo
    // cajón donde caían cosas del tenant (gamificación) junto a cosas de la
    // plataforma entera.
    groups.push({
      label: 'Plataforma',
      icon: 'building',
      items: [
        { href: '/admin/tenants', label: 'Tenants', icon: 'building' },
        { href: '/admin/marketplace', label: 'Marketplace módulos', icon: 'package' },
        { href: '/admin/licencia', label: 'Licencia', icon: 'shield' },
      ],
    });
  }
  return groups;
}
