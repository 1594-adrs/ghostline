import type { ScriptFile } from '../core/contracts';

/** Browser-preview script: exercises headings, notes, pauses, lists and every emphasis. */
export const DEMO_SCRIPT: ScriptFile = {
  path: 'demo/revision-sprint.md',
  name: 'revision-sprint.md',
  format: 'md',
  content: `---
title: Revisión del sprint 42
speed: 150
---

# Apertura

Buenos días a todos. Gracias por sacar quince minutos para esta revisión. Hoy les cuento **tres cosas**: qué entregamos, qué aprendimos y qué viene después.

> Sonreír. Mirar a la cámara, no a la pantalla.

# Lo que entregamos

El nuevo flujo de pagos está en producción desde el martes. Redujimos el tiempo de compra de *cuarenta y dos* a dieciocho segundos.

- Pago con un solo toque para clientes recurrentes.
- Facturas enviadas al correo de forma automática.
- Soporte para \`PSE\` y tarjetas débito.

---

# Lo que aprendimos

La mitad de los abandonos ocurría en el formulario de dirección. No era un problema técnico: era un problema de **confianza**. Cuando mostramos el logo del banco antes de pedir datos, la conversión subió un once por ciento.

> Compartir pantalla: gráfico de conversión.

# Lo que viene

En las próximas dos semanas vamos a medir el impacto en las ventas reales y a preparar la versión para Perú. Si tienen preguntas, este es el momento.
`,
};
