# Sistema de Retos automatizado — Dropi Academy (módulo Bienvenido)

Fuente: specs `Dropi_Academy_MVP_Argentina` (Retos 1–5) + decisiones de producto de Diego (2026-09-14).
Versión visual del plan: https://claude.ai/code/artifact/e2263a56-98a9-4dd7-9f94-957ecc62b359

## 1. Tesis

Un reto se completa **solo cuando todas sus acciones están hechas**, y **recién ahí** da puntos e insignia.
Nada parcial. Todo validado por la plataforma (video 100 %, quiz 3/3, acciones validadas por IA).

Hoy los bloques existen (puntos por lección, insignias, quiz con feedback, pregunta de perfil), pero la
completitud compuesta no: "ver el video ≈ fin" completa la lección y dispara puntos; el quiz es otra
lección que se completa sola; la pregunta de perfil no cuenta. Este plan construye la regla central.

## 2. Los 5 retos

| #   | Reto                      | Lección (curso "VENDE EN 24H CON DROPI")                        | Pts | Insignia                | Acciones para el 100 %                                                                                                                        |
| --- | ------------------------- | --------------------------------------------------------------- | --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Entender el modelo        | ¿Qué es el dropshipping y cómo crear tu cuenta gratis en dropi? | 50  | 🧠 Mente Dropshipper    | video · quiz · pregunta de perfil                                                                                                             |
| 2   | Elegí tu producto ganador | Las 3 reglas simples para elegir tu primer producto             | 80  | 🎯 Cazador de Productos | video · quiz · IA: análisis de imagen del producto · IA: pantallazo del primer pedido (opcional p/ reto, obligatorio p/ insignia ⚡ Activado) |
| 3   | Vender sin publicidad     | Publica tu producto hoy y cierra tu primera venta por chat      | 100 | 📣 Vendedor Audaz       | video · quiz · IA: 2 capturas de publicación (una por canal)                                                                                  |
| 4   | Cargar tu primer pedido   | Cómo montar tu primer pedido en Dropi y enviarlo al cliente     | 120 | 📦 Primer Despacho      | video · quiz                                                                                                                                  |
| 5   | Retirar tus ganancias     | Cómo retirar tus ganancias a tu cuenta bancaria                 | 150 | 💰 Primer Retiro        | video · quiz → certificado del módulo                                                                                                         |

Total: **+500 pts** + certificado virtual (nombre del alumno, nombre del módulo, fecha; descargable y compartible).
Los 5 quizzes (15 preguntas con feedback ✅ "¡Increíble!" / 🔄 "¡Casi correcto!") ya están estructurados.

### Reglas universales

- **Los retos NO son lineales**: los 5 siempre disponibles, sin prerrequisitos ni bloqueo entre ellos.
  "Ir al Reto N+1" es navegación sugerida, no un desbloqueo.
- Puntos e insignia **solo al 100 %** del reto (todas las acciones requeridas). Sin puntos parciales
  (los puntos están pensados para redención futura: representan retos completamente ejecutados).
- `% del reto` = acciones requeridas hechas ÷ requeridas. `% del módulo` = promedio de los 5.
- Video: 100 % real (hoy el player dispara "casi fin" a ≤30 s → ajustar). El % se muestra siempre.
- Quiz de reto: **umbral 100 % (3/3)**, **intentos ilimitados** sin penalización (Didacta trae 60 % por defecto).
- El único desbloqueo del spec es **externo al módulo**: al completar los 5 retos, "acceso al siguiente
  nivel de contenido" (Explorador) + CTA "Ver el siguiente curso →". Nivel Bienvenido = 0–100 órdenes/mes.
- **Insignia de perfil ≠ insignia del reto.** La de perfil (subnivel dentro de Bienvenido) arranca en
  🧠 Mente Dropshipper y sube a **⚡ Activado** con el primer pedido validado. Ambas quedan en la colección.

### Acción 4 del Reto 2 — caso especial

Opcional para el reto, obligatoria para el cambio de insignia de perfil. **Nunca bloquea.**

- Escenario A (sin pedidos): completa el reto al 100 % con las acciones 1-3; la acción 4 queda visible
  como "pendiente" en su perfil; cuando consiga su primera orden, vuelve y la completa.
- Escenario B (ya tiene pedido): sube el pantallazo del pedido cargado en Dropi → la IA con visión lo
  valida → insignia de perfil 🧠 → ⚡ Activado.
- **No va contra la base de datos de Dropi** (decisión de Diego). Se valida por pantallazo.

## 3. Diseño

### 3.1 `Reto` como entidad propia (admin)

```
Reto { key, title, order, moduleKey, lessonId, quizId, points, badge{key,label,emoji},
       completionMessage, ctaNextRetoKey, actions[] }
Action { type, key, title, description, required, config: Json
         (pasos/instrucciones, qué entregar, nº de capturas, prompt, tipo de feedback) }
```

El reto lleva **título propio** (≠ título de la lección ≠ nombre del video).

### 3.2 Catálogo de acciones

| Tipo                                      | Quién valida                                      | Uso                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIDEO_COMPLETE`                          | player (100 % real)                               | todos (implícita)                                                                                                                                   |
| `QUIZ_PASS`                               | assessments (3/3)                                 | todos (implícita)                                                                                                                                   |
| `PROFILE_QUESTION`                        | captura de dato                                   | Reto 1: "¿Cuál es tu situación actual?" (4 opciones)                                                                                                |
| `AI_ANALYZE_IMAGE`                        | IA con visión (AI Gateway, OpenAI ya configurado) | Reto 2 (producto: **analiza y recomienda** ángulo · público · valor; pedido: **valida** → ⚡) · Reto 3 (**valida** cada captura + **mensaje fijo**) |
| `AI_CHAT_CONSULT`                         | tutor / Dana (≥1 consulta)                        | interacción simple                                                                                                                                  |
| `SELF_CONFIRM`                            | el alumno confirma                                | respaldo sin automatización                                                                                                                         |
| `DB_ORDER_CREATED` / `DB_ORDER_DELIVERED` | BD de Dropi por email (cron)                      | **retos futuros** — no los usa el MVP                                                                                                               |
| `UNLOCK_NEXT_LEVEL`                       | efecto de fin de módulo                           | acceso al curso del siguiente nivel (Explorador)                                                                                                    |
| `DB_ORDERS_PER_MONTH`                     | BD de Dropi                                       | futuro: nivel por órdenes/mes                                                                                                                       |

`AI_ANALYZE_IMAGE` admite **varias capturas validadas por separado**: Reto 3 pide 2 (una por canal);
si una se aprueba cuenta **1 de 2** y la otra queda pendiente. Solo completa si la IA devuelve
`{ valido: true, feedback }`. Dos tipos de feedback: **análisis con recomendaciones** (Reto 2 producto)
o **validación + mensaje fijo** (Reto 3: "¡Excelente, ya estás en el juego! 🎉 …").

### 3.3 Motor de completitud (backend, por eventos, idempotente)

```
video 100 % → VIDEO_COMPLETE hecha         (el player ya NO completa la lección)
assessments.attempt.passed (quiz del reto) → QUIZ_PASS hecha
reto.action.done (perfil / IA / confirm)   → esa acción hecha
   → recalcular % del reto del alumno
   → si 100 % y no premiado: marcar lección completa · award(points) · grantBadge() · reto.completed
```

- El quiz se asocia al reto y se **embebe** en su página; `AssessmentsLearningBridge` deja de completar
  la lección QUIZ para quizzes de reto (alimenta al motor).
- Puntos/insignia una sola vez (sourceKey alumno+reto).
- El pantallazo del pedido validado → insignia de perfil ⚡ (independiente del 100 %).
- **Certificado sin trabajo extra**: `learning.course.completed` → módulo certificates (revisar plantilla:
  nombre, módulo, fecha). Al 100 % del módulo: mensaje de cierre + CTAs "Descargar mi certificado" y
  "Ver el siguiente curso" (+ `UNLOCK_NEXT_LEVEL` si existe el curso Explorador).

### 3.4 Página del reto (alumno)

Video con % real · quiz embebido · acciones con su UI · widget (✅/⬜ por acción, % reto, % módulo) ·
al 100 %: mensaje de cierre del spec, recompensas, CTA "Ir al Reto N+1".

### 3.5 Asistente flotante (idea de Diego)

Botón flotante global con dos opciones:

1. **Hablar con Dana** — chat con el agente n8n para temas internos de Dropi.
   Webhook de n8n: `https://n8n-n8n.ojjmzk.easypanel.host/webhook/mensaje_didacta`.
   La plataforma envía `{ mensaje, correo }`; expone un **webhook propio** para recibir la respuesta
   (asíncrona) y la muestra en el chat. Pendiente: formato de la respuesta y secreto compartido.
2. **Reportar un reto** — los retos como **botones** (preselecciona el reto actual). Para la acción
   que toca: **explica los pasos** (si el alumno pregunta "¿cómo envío mi reto?" responde con los pasos
   de su reto), **recibe la evidencia** (capturas), **la IA valida/analiza y responde**, y **la acción
   queda hecha sola** (el "confirmar en la plataforma" del spec se vuelve automático).
   Sustituye el "enviar por WhatsApp al agente" del spec. La misma acción también se entrega desde la
   página del reto.

Reto 2 (acción 3): pasos 1-2 del spec = instrucciones; paso 3 = subir la imagen en el panel; paso 4 =
la IA responde ángulo de venta · a quién venderle · cómo comunicar el valor; paso 5 = automático.
Reto 3: 2 capturas (una por canal: estado/grupo de WhatsApp, Marketplace, campaña de Meta, TikTok…) →
la IA valida cada una → mensaje fijo del spec → hecha.

### 3.6 Perfil del alumno (vista nueva)

Marcador global de puntos · colección de insignias · insignia de perfil vigente (🧠/⚡) · acciones
pendientes (p. ej. "Mi primer pedido").

### 3.7 Admin de Retos (rol admin, cuelga de "Aprendizaje")

Listado · crear/editar (lección, quiz, puntos, insignia, cierre, acciones del catálogo con config) ·
progreso por alumno.

### 3.8 Datos (sin FKs cross-módulo)

`mod_retos_reto`, `mod_retos_action`, `mod_retos_action_done` (evoluciona `mod_reto_action_done`,
con `meta` para el feedback de la IA / nº de captura), `mod_retos_completion`.
Reusa: gamificación (puntos, insignias), `mod_profile_answer`, assessments, certificates, storage.

## 4. Fases

| Fase             | Entrega                                                                                                                                    | Desbloquea                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| **A**            | Modelo + API + admin de Retos + seed de los 5 retos con sus quizzes                                                                        | Definir retos sin código  |
| **B**            | Motor + página del reto (video 100 %, quiz embebido, widget, cierre) + puntos/insignia al 100 %                                            | Retos 4 y 5 completos     |
| **C**            | Pregunta de perfil que cuenta · `AI_ANALYZE_IMAGE` con OpenAI (modelo con visión) · asistente flotante "Reportar un reto" · `SELF_CONFIRM` | Retos 1-3 → los 5 del MVP |
| **D** (opcional) | Conector BD Dropi + cron (`DB_ORDER_*`, nivel por órdenes/mes)                                                                             | Retos futuros             |
| **E**            | "Hablar con Dana": envío a n8n + webhook receptor + chat en el asistente                                                                   | Opción Dana               |

## 5. Decisiones tomadas

- Reto 1 se llama **"Entender el modelo"**; insignia del Reto 3 = **📣 Vendedor Audaz**; el módulo tiene **5** retos (las fichas 2/3 que dicen "4" son error de copia).
- Reto = entidad propia + una lección como página (administrable, no escondido en `lesson.content`).
- Motor por eventos en backend (no checks en el frontend): los puntos no se pueden forzar.
- Quiz embebido en el reto para exigir video **y** quiz como una sola unidad.
- IA con visión **dentro de la plataforma** en lugar de WhatsApp; Dana se integra por webhook.
- Reto 2 **no** usa la BD de Dropi; la familia `DB_*` queda para retos futuros (Fase D opcional).
- Reto 3: 2 capturas, una por canal, validadas por separado ("1 de 2").
- Proveedor IA: el **OpenAI ya configurado** en Didacta (requiere modelo con visión, p. ej. gpt-4o-mini).
