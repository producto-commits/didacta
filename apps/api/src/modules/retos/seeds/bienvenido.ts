/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import type { RetoSeedFile } from '../retos.service';

/**
 * Seed del módulo "Bienvenido" (Dropi Academy): los 5 retos con sus quizzes
 * (15 preguntas con feedback ✅/🔄) y acciones. Fuente: specs
 * Dropi_Academy_MVP_Argentina + decisiones en docs/retos/plan-retos.md.
 * Va como módulo TS (no JSON) para que viaje en el `dist` sin config extra.
 * Se importa con POST /admin/retos/import/bienvenido (idempotente por key).
 */
export const bienvenidoSeed: RetoSeedFile = {
  courseSlug: 'vende-en-24h-con-dropi',
  moduleKey: 'bienvenido',
  retos: [
    {
      key: 'bienvenido-1',
      position: 1,
      title: 'Entender el modelo',
      points: 50,
      badge: {
        key: 'mente-dropshipper',
        label: 'Mente Dropshipper',
        emoji: '🧠',
      },
      lessonTitleContains: 'Qué es el dropshipping',
      completionMessage:
        '¡Reto 1 completado! Ya entendés cómo funciona el modelo. Ahora viene lo más divertido.',
      quiz: {
        title: 'Reto 1 — Entender el modelo',
        passThreshold: 100,
        showFeedback: true,
        questions: [
          {
            type: 'SINGLE_CHOICE',
            prompt:
              '¿Qué sucede con el producto cuando un cliente te hace un pedido en el modelo de dropshipping?',
            options: [
              {
                label: 'Vos comprás el producto y se lo enviás al cliente',
                isCorrect: false,
              },
              {
                label: 'El producto pasa primero por tus manos y luego lo reenviás',
                isCorrect: false,
              },
              {
                label: 'El proveedor empaca y envía el producto directamente al cliente',
                isCorrect: true,
              },
              {
                label: 'La transportadora busca el producto en la fábrica y lo entrega',
                isCorrect: false,
              },
            ],
            feedback:
              'Exacto. Eso es lo que hace especial al modelo: el producto nunca pasa por tus manos. Vos lo publicás y lo vendés, el proveedor lo empaca y lo despacha directamente a tu cliente. Tu rol es conectar la necesidad con la solución.',
            feedbackIncorrect:
              'No te preocupes — estás aprendiendo. La respuesta correcta es C. En el dropshipping el proveedor es quien tiene el inventario y se encarga de empacar y enviar el producto directo a tu cliente. Vos NO necesitás tener el producto en tus manos.',
          },
          {
            type: 'SINGLE_CHOICE',
            prompt:
              '¿Cuál es la principal ventaja del dropshipping para alguien que recién empieza?',
            options: [
              {
                label: 'Podés vender cualquier producto sin necesidad de promocionarlo',
                isCorrect: false,
              },
              {
                label: 'No necesitás comprar el producto por adelantado ni tener inventario propio',
                isCorrect: true,
              },
              {
                label: 'Solo podés vender a personas que ya conocés',
                isCorrect: false,
              },
            ],
            feedback:
              '¡Exacto! Esa es la gran ventaja: empezás a vender sin invertir en stock. El producto solo se mueve cuando ya hay una venta concreta. Sin inventario, sin riesgo inicial, sin plata parada.',
            feedbackIncorrect:
              'No te preocupes — estás aprendiendo. La respuesta correcta es B. En el dropshipping no comprás nada por adelantado: publicás, vendés, y el proveedor despacha. Sin inventario propio, sin inversión inicial.',
          },
          {
            type: 'SINGLE_CHOICE',
            prompt: '¿Cuál es el rol de Dropi dentro del modelo de dropshipping?',
            options: [
              {
                label: 'Fabricar los productos que vas a vender',
                isCorrect: false,
              },
              {
                label: 'Hacer la publicidad de tu tienda en redes sociales',
                isCorrect: false,
              },
              {
                label:
                  'Conectar a los vendedores, proveedores y transportadoras en un solo sistema',
                isCorrect: true,
              },
              {
                label: 'Cobrarle directamente al cliente por vos',
                isCorrect: false,
              },
            ],
            feedback:
              '¡Correcto! Dropi es el ecosistema que conecta todo: vos como vendedor, el proveedor con el producto y la transportadora que lo entrega. Ese sistema es lo que te da control, trazabilidad y seguridad en cada pedido.',
            feedbackIncorrect:
              'No pasa nada — estás aprendiendo. La respuesta correcta es C. Dropi es la tecnología que une a todos los actores del modelo: vendedor, proveedor y transportadora. Sin ese sistema cada parte funcionaría por separado y sin control real.',
          },
        ],
      },
      actions: [
        {
          key: 'perfil',
          type: 'PROFILE_QUESTION',
          title: 'Pregunta de perfil',
          required: true,
          config: {
            questionKey: 'situacion-actual',
            prompt: '¿Cuál es tu situación actual?',
            options: [
              'Soy nuevo en el comercio electrónico',
              'Ya vendí algo antes pero quiero mejorar',
              'Tengo un negocio y quiero sumarle ventas online',
              'Quiero emprender',
            ],
          },
        },
      ],
    },
    {
      key: 'bienvenido-2',
      position: 2,
      title: 'Elegí tu primer producto ganador',
      points: 80,
      badge: {
        key: 'cazador-de-productos',
        label: 'Cazador de Productos',
        emoji: '🎯',
      },
      lessonTitleContains: '3 reglas',
      completionMessage:
        '¡Reto 2 completado! Ya tenés tu producto. Ahora aprendés cómo venderlo sin gastar un solo peso en publicidad.',
      quiz: {
        title: 'Reto 2 — Elegí tu primer producto ganador',
        passThreshold: 100,
        showFeedback: true,
        questions: [
          {
            type: 'SINGLE_CHOICE',
            prompt:
              'Según lo que viste, ¿cuál es el primer criterio para elegir un producto ganador?',
            options: [
              {
                label: 'Que sea un producto que a vos te guste o que usarías',
                isCorrect: false,
              },
              {
                label: 'Que tenga el precio más bajo del catálogo de Dropi',
                isCorrect: false,
              },
              {
                label: 'Que resuelva una necesidad real de las personas',
                isCorrect: true,
              },
              {
                label: 'Que sea el producto más vendido de la plataforma',
                isCorrect: false,
              },
            ],
            feedback:
              'Exacto. No vendés un organizador de zapatos — vendés orden, espacio limpio y zapatos protegidos. Cuando el producto resuelve algo real, el cliente lo necesita. Eso es lo que hace que se venda.',
            feedbackIncorrect:
              'No te preocupes — estás aprendiendo. La respuesta correcta es C. Que a vos te guste o que tenga buen precio no garantiza que se venda. Lo que importa es que resuelva algo que las personas realmente necesitan en su día a día.',
          },
          {
            type: 'SINGLE_CHOICE',
            prompt:
              'Encontraste un producto en Dropi. El precio del proveedor es $8.000 pesos argentinos y el flete cuesta $2.500. ¿A cuánto mínimo deberías venderlo para tener ganancia real?',
            options: [
              {
                label: 'A $8.000 — el mismo precio del proveedor',
                isCorrect: false,
              },
              {
                label: 'A $10.000 — solo alcanza para cubrir proveedor y flete',
                isCorrect: false,
              },
              {
                label: 'A más de $10.500 — para cubrir proveedor + flete y que sobre ganancia',
                isCorrect: true,
              },
              {
                label: 'Al precio sugerido que aparece en Dropi, siempre',
                isCorrect: false,
              },
            ],
            feedback:
              '¡Muy bien! La fórmula es simple: $8.000 del proveedor + $2.500 de flete = $10.500 de costo real. Todo lo que vendas por encima de eso es tu ganancia. El precio sugerido de Dropi es una referencia — vos decidís el margen.',
            feedbackIncorrect:
              'No pasa nada — estás aprendiendo. La respuesta correcta es C. Tu costo real es proveedor + flete: $8.000 + $2.500 = $10.500. Si vendés a ese precio o menos, trabajás sin ganancia. Necesitás vender por encima de $10.500 para que el negocio tenga sentido.',
          },
          {
            type: 'SINGLE_CHOICE',
            prompt:
              '¿Por qué se recomienda elegir productos con al menos 100 unidades de stock disponibles?',
            options: [
              {
                label: 'Porque Dropi solo permite vender productos con ese stock mínimo',
                isCorrect: false,
              },
              {
                label: 'Porque así podés comprar unidades por adelantado y guardarlas',
                isCorrect: false,
              },
              {
                label:
                  'Para poder vender con tranquilidad antes de que el stock se agote, ya que otros vendedores también pueden promocionar ese producto',
                isCorrect: true,
              },
              {
                label: 'Porque los productos con poco stock son de menor calidad',
                isCorrect: false,
              },
            ],
            feedback:
              '¡Correcto! El catálogo de Dropi es compartido — otros vendedores ven los mismos productos. Si elegís uno con poco stock puede agotarse rápido. Con 100+ unidades tenés margen para vender con tranquilidad sin que se te corte el suministro.',
            feedbackIncorrect:
              'No te preocupes — estás aprendiendo. La respuesta correcta es C. El catálogo de Dropi es compartido entre todos los vendedores. Un producto con poco stock puede agotarse antes de que puedas venderlo. Por eso se recomienda buscar productos con al menos 100 unidades disponibles.',
          },
        ],
      },
      actions: [
        {
          key: 'producto',
          type: 'AI_ANALYZE_IMAGE',
          title: 'Análisis de tu producto con IA',
          required: true,
          config: {
            steps: [
              'Explora el catálogo de Dropi y elige un producto.',
              'Toma una captura o foto del producto elegido.',
              'Súbela aquí para que la IA la analice.',
            ],
            submissions: 1,
            feedbackMode: 'analysis',
            prompt:
              'La imagen debe mostrar un producto del catálogo de Dropi (ficha de producto, foto o captura). Si lo es, responde con recomendaciones personalizadas de venta: ángulo de venta sugerido, a quién le puede vender ese producto y cómo comunicar su valor. Si NO es un producto, indícalo y pide otra captura.',
          },
        },
        {
          key: 'pedido',
          type: 'AI_ANALYZE_IMAGE',
          title: 'Mi primer pedido',
          required: false,
          config: {
            steps: [
              'Carga tu primer pedido en Dropi.',
              'Toma una captura del pedido ya cargado.',
              'Súbela aquí; al validarse cambia tu insignia de perfil a ⚡ Activado.',
            ],
            submissions: 1,
            feedbackMode: 'fixed',
            prompt:
              'La imagen debe mostrar un pedido cargado en la plataforma Dropi (pantalla de pedido/orden con datos de cliente, producto o estado). Valida que sea un pedido real de Dropi.',
            fixedMessage:
              '¡Tu primer pedido está cargado! 🎉 Pasaste de 🧠 Mente Dropshipper a ⚡ Activado. Ya estás vendiendo de verdad.',
            grantsProfileBadge: {
              key: 'activado',
              label: 'Activado',
              emoji: '⚡',
            },
          },
        },
      ],
    },
    {
      key: 'bienvenido-3',
      position: 3,
      title: 'Aprendé a vender sin publicidad',
      points: 100,
      badge: {
        key: 'vendedor-audaz',
        label: 'Vendedor Audaz',
        emoji: '📣',
      },
      lessonTitleContains: 'Publica tu producto',
      completionMessage:
        '¡Reto 3 completado! Ya publicaste, ya sabés cómo responder. Ahora solo queda esperar esa primera respuesta y cerrarla. El Reto 4 te acompaña día a día hasta que llegue.',
      quiz: {
        title: 'Reto 3 — Aprendé a vender sin publicidad',
        passThreshold: 100,
        showFeedback: true,
        questions: [
          {
            type: 'SINGLE_CHOICE',
            prompt:
              'Según el video, ¿cuál es el primer canal recomendado para publicar tu producto sin invertir en publicidad?',
            options: [
              {
                label: 'El estado de WhatsApp y grupos donde ya tenés contactos de confianza',
                isCorrect: true,
              },
              {
                label: 'Crear una página de Instagram y conseguir seguidores primero',
                isCorrect: false,
              },
              {
                label: 'Esperar a tener al menos 500 contactos antes de publicar',
                isCorrect: false,
              },
              {
                label: 'Publicar solo en grupos de ventas de Facebook',
                isCorrect: false,
              },
            ],
            feedback:
              '¡Exacto! Tu red cercana es tu primer mercado. Ya te conocen, ya confían en vos y no necesitás convencer a nadie de quién sos. Un estado de WhatsApp o un mensaje en un grupo familiar puede ser tu primera venta.',
            feedbackIncorrect:
              'No te preocupes — estás aprendiendo. La respuesta correcta es A. No necesitás seguidores ni una audiencia grande para empezar. Tu WhatsApp y tus grupos ya tienen personas que te conocen y confían en vos — ese es tu primer mercado.',
          },
          {
            type: 'SINGLE_CHOICE',
            prompt:
              'Un cliente te pregunta el precio por WhatsApp. ¿Cuál es la mejor forma de responderle?',
            options: [
              {
                label: 'Mandarle solo el precio sin más explicación',
                isCorrect: false,
              },
              {
                label: 'Pedirle que vaya a tu publicación de Marketplace para ver los detalles',
                isCorrect: false,
              },
              {
                label:
                  'Saludarlo, darle el precio, aclarar que es pago al recibir y preguntarle si tiene alguna duda',
                isCorrect: true,
              },
              {
                label: 'Esperar a que te pregunte más cosas antes de responder',
                isCorrect: false,
              },
            ],
            feedback:
              '¡Perfecto! Esa conversación genera confianza. Saludar + precio + aclarar que es contra entrega + abrir la puerta a preguntas es la fórmula que cierra ventas. Simple y efectiva.',
            feedbackIncorrect:
              'No pasa nada — estás aprendiendo. La respuesta correcta es C. Cuando alguien pregunta el precio ya está interesado. Saludarlo bien, darle el precio claro, aclarar que paga al recibir y preguntarle si tiene dudas es lo que convierte ese interés en una venta.',
          },
          {
            type: 'SINGLE_CHOICE',
            prompt:
              'Un cliente te dice que el precio le parece alto y te pide descuento. ¿Qué hacés?',
            options: [
              {
                label: 'Bajás el precio de inmediato para no perder la venta',
                isCorrect: false,
              },
              {
                label: 'Le decís que no podés bajar el precio y terminás la conversación',
                isCorrect: false,
              },
              {
                label:
                  'No bajás el precio y responde hablando de los beneficios y el valor del producto',
                isCorrect: true,
              },
              {
                label: 'Le ofrecés envío gratis como compensación aunque eso te quite ganancia',
                isCorrect: false,
              },
            ],
            feedback:
              '¡Muy bien! El precio ya fue calculado para ser rentable — bajarlo sin razón te quita ganancia. Cuando alguien regatea, la respuesta es hablar del valor: qué problema resuelve, qué beneficios tiene, por qué vale lo que vale. Eso cierra más ventas que cualquier descuento.',
            feedbackIncorrect:
              'No te preocupes — estás aprendiendo. La respuesta correcta es C. Tu precio ya tiene un margen calculado — bajarlo de entrada te quita rentabilidad. Cuando alguien intenta regatear, hablá de los beneficios del producto y su valor real. El descuento es el último recurso, no el primero.',
          },
        ],
      },
      actions: [
        {
          key: 'publicacion',
          type: 'AI_ANALYZE_IMAGE',
          title: 'Publicación confirmada',
          required: true,
          config: {
            steps: [
              'Publica tu producto en al menos dos canales: estado o grupo de WhatsApp, Facebook Marketplace, campaña de Meta, TikTok o cualquier red social.',
              'Toma una captura de cada publicación.',
              'Sube aquí las dos capturas (una por canal).',
            ],
            submissions: 2,
            feedbackMode: 'fixed',
            prompt:
              'La imagen debe mostrar una publicación real de un producto en un canal de venta (estado o grupo de WhatsApp, Facebook Marketplace, anuncio de Meta, TikTok u otra red social). Indica el canal detectado y valida que sea una publicación del producto.',
            fixedMessage:
              '¡Excelente, ya estás en el juego! 🎉 Publicaste tu producto — ese es el paso que muchos no dan. Ahora lo más importante es estar muy pendiente de todos los canales donde publicaste. Los clientes pueden escribirte por WhatsApp, por el grupo o por Marketplace en cualquier momento, y la velocidad de respuesta es clave para cerrar la venta. ¡A estar atentos y a vender! 💪',
          },
        },
      ],
    },
    {
      key: 'bienvenido-4',
      position: 4,
      title: 'Cómo cargar tu primer pedido en Dropi',
      points: 120,
      badge: {
        key: 'primer-despacho',
        label: 'Primer Despacho',
        emoji: '📦',
      },
      lessonTitleContains: 'montar tu primer pedido',
      completionMessage:
        '¡Reto 4 completado! Ya sabés cómo convertir una conversación en una orden real. Solo te queda aprender cómo retirar tus ganancias.',
      quiz: {
        title: 'Reto 4 — Cómo cargar tu primer pedido en Dropi',
        passThreshold: 100,
        showFeedback: true,
        questions: [
          {
            type: 'SINGLE_CHOICE',
            prompt:
              'Cuando un cliente te da sus datos y querés crear el pedido en Dropi, ¿qué opción elegís si el cliente paga al recibir?',
            options: [
              {
                label: 'Con recaudo — el cliente paga al recibir el paquete',
                isCorrect: true,
              },
              {
                label: 'Sin recaudo — solo si el cliente te pagó por adelantado',
                isCorrect: false,
              },
              {
                label: 'Con recaudo solo si tenés la wallet cargada',
                isCorrect: false,
              },
              {
                label: 'Sin recaudo — es la opción más rápida para despachar',
                isCorrect: false,
              },
            ],
            feedback:
              '¡Exacto! Con recaudo significa que la transportadora le cobra al cliente cuando entrega el paquete. No necesitás tener nada cargado en tu wallet — el cliente paga al recibir y Dropi te acredita tu ganancia después de la entrega.',
            feedbackIncorrect:
              'No te preocupes — estás aprendiendo. La respuesta correcta es A. Con recaudo es la opción para ventas contra entrega: el cliente paga cuando recibe el paquete. Sin recaudo es solo para cuando el cliente ya te pagó por adelantado.',
          },
          {
            type: 'SINGLE_CHOICE',
            prompt:
              'El pedido quedó creado y aparece en estado "Pendiente de confirmación". ¿Qué hacés?',
            options: [
              {
                label: 'Esperás a que el proveedor lo confirme automáticamente',
                isCorrect: false,
              },
              {
                label: 'Le avisás al cliente que el pedido está demorado',
                isCorrect: false,
              },
              {
                label:
                  'Le das confirmar pedido dentro de Dropi para que el proveedor genere la guía',
                isCorrect: true,
              },
              {
                label: 'Cancelás y volvés a cargarlo',
                isCorrect: false,
              },
            ],
            feedback:
              '¡Perfecto! Confirmar el pedido dentro de Dropi es el paso que activa al proveedor para que genere la guía de envío. Sin esa confirmación el pedido queda parado. Una vez confirmado, solo queda esperar el número de guía para compartírselo al cliente.',
            feedbackIncorrect:
              'No pasa nada — estás aprendiendo. La respuesta correcta es C. Cuando el pedido aparece como "Pendiente de confirmación" tenés que confirmarlo vos dentro de Dropi. Eso le avisa al proveedor que genere la guía. Sin ese paso el pedido no avanza.',
          },
          {
            type: 'SINGLE_CHOICE',
            prompt: '¿Cuándo se acredita el dinero de la venta en tu wallet de Dropi?',
            options: [
              {
                label: 'Cuando cargás el pedido en la plataforma',
                isCorrect: false,
              },
              {
                label: 'Cuando la transportadora recoge el paquete del proveedor',
                isCorrect: false,
              },
              {
                label: 'Cuando el cliente confirma que recibió el paquete por WhatsApp',
                isCorrect: false,
              },
              {
                label: 'Cuando el pedido aparece como entregado — en menos de 24 horas después',
                isCorrect: true,
              },
            ],
            feedback:
              '¡Correcto! Una vez que el pedido aparece como entregado en Dropi, en menos de 24 horas ese dinero ya está en tu wallet listo para usar o retirar. No necesitás hacer nada — el sistema lo acredita automáticamente.',
            feedbackIncorrect:
              'No te preocupes — estás aprendiendo. La respuesta correcta es D. El dinero se acredita en tu wallet cuando el pedido aparece como entregado en Dropi — y sucede automáticamente en menos de 24 horas. No importa si el cliente te avisó o no por WhatsApp.',
          },
        ],
      },
      actions: [],
    },
    {
      key: 'bienvenido-5',
      position: 5,
      title: 'Cómo retirar tus ganancias',
      points: 150,
      badge: {
        key: 'primer-retiro',
        label: 'Primer Retiro',
        emoji: '💰',
      },
      lessonTitleContains: 'retirar tus ganancias',
      completionMessage:
        '¡Módulo completado! 🏆 Hiciste algo que la mayoría solo sueña: ejecutaste. Ya sabés qué es el dropshipping, elegiste tu producto, publicaste, cargaste tu primer pedido y sabés cómo retirar tus ganancias. Ahora viene escalar.',
      quiz: {
        title: 'Reto 5 — Cómo retirar tus ganancias',
        passThreshold: 100,
        showFeedback: true,
        questions: [
          {
            type: 'SINGLE_CHOICE',
            prompt:
              '¿Qué tenés que configurar primero en Dropi antes de poder retirar tus ganancias?',
            options: [
              {
                label: 'El nombre de tu tienda y el correo electrónico',
                isCorrect: false,
              },
              {
                label: 'Tus datos personales y tu cuenta bancaria donde querés recibir el dinero',
                isCorrect: true,
              },
              {
                label: 'El método de pago para futuros pedidos',
                isCorrect: false,
              },
              {
                label: 'La dirección de tu depósito para envíos',
                isCorrect: false,
              },
            ],
            feedback:
              '¡Exacto! Sin los datos personales y la cuenta bancaria configurada, Dropi no sabe a dónde enviarte el dinero. Es el primer paso antes de hacer cualquier retiro. Hacelo con calma, una sola vez, y ya queda listo para siempre.',
            feedbackIncorrect:
              'No te preocupes — estás aprendiendo. La respuesta correcta es B. Antes de retirar tenés que tener tus datos personales completos y tu cuenta bancaria registrada en Dropi. Sin eso la plataforma no puede procesar el retiro.',
          },
          {
            type: 'SINGLE_CHOICE',
            prompt:
              'Hiciste la solicitud de retiro y en tu wallet ya no aparece el dinero pero todavía no llegó a tu cuenta bancaria. ¿Qué significa eso?',
            options: [
              {
                label: 'Hubo un error y perdiste el dinero',
                isCorrect: false,
              },
              {
                label: 'Tenés que volver a hacer la solicitud de retiro',
                isCorrect: false,
              },
              {
                label:
                  'Es normal — puede tardar entre 24 y 72 horas hábiles en verse reflejado en tu cuenta',
                isCorrect: true,
              },
              {
                label: 'Dropi rechazó la solicitud y hay que contactar soporte urgente',
                isCorrect: false,
              },
            ],
            feedback:
              '¡Correcto! Que la wallet ya no muestre el saldo es una señal de que la solicitud fue procesada. El dinero puede tardar entre 24 y 72 horas hábiles en verse en tu cuenta bancaria — es completamente normal, sobre todo en los primeros retiros.',
            feedbackIncorrect:
              'No te preocupes — estás aprendiendo. La respuesta correcta es C. Que el saldo ya no aparezca en la wallet es normal — significa que la solicitud está en proceso. El dinero puede tardar entre 24 y 72 horas hábiles en llegar a tu cuenta bancaria. No hay nada que hacer salvo esperar.',
          },
          {
            type: 'SINGLE_CHOICE',
            prompt: '¿Por qué puede aparecer una solicitud de retiro en estado "rechazado"?',
            options: [
              {
                label:
                  'Porque los datos bancarios fueron ingresados incorrectamente — un número mal, un punto o un espacio de más',
                isCorrect: true,
              },
              {
                label: 'Porque Dropi tiene un límite de retiros por mes',
                isCorrect: false,
              },
              {
                label: 'Porque el pedido todavía no fue entregado al cliente',
                isCorrect: false,
              },
              {
                label: 'Porque la wallet tiene saldo insuficiente para retirar',
                isCorrect: false,
              },
            ],
            feedback:
              '¡Exacto! Un retiro rechazado casi siempre es por un error en los datos bancarios — un número incorrecto, un punto de más o un espacio. No significa que perdiste el dinero. Corregís los datos y volvés a hacer la solicitud.',
            feedbackIncorrect:
              'No pasa nada — estás aprendiendo. La respuesta correcta es A. Cuando una solicitud aparece como rechazada casi siempre es porque los datos bancarios tienen algún error — un dígito mal, un punto o un espacio donde no va. Corregís los datos bancarios y hacés la solicitud de nuevo. El dinero sigue en tu wallet.',
          },
        ],
      },
      actions: [],
    },
  ],
};
