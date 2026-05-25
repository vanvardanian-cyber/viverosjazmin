# Viveros Jazmín — Sitio Web

Mockup completo y funcional para Viveros Jazmín (Castelló de la Plana). HTML/CSS/JS puro, sin dependencias ni paso de build. Listo para migrar a Shopify, WooCommerce o cualquier CMS.

## Cómo abrirlo

Doble clic en `index.html`. Se abre directamente en el navegador, sin servidor.

> Si Chrome bloquea algo por el protocolo `file://`, sirve la carpeta con
> `python3 -m http.server` desde dentro y entra en `http://localhost:8000`.

## Estructura

```
viveros-jazmin/
├── index.html         · Inicio (hero, categorías, destacados, historia, visita)
├── tienda.html        · Catálogo con filtros + buscador
├── producto.html      · Ficha de producto (?id=int-01)
├── carrito.html       · Carrito (persistente en localStorage)
├── checkout.html      · Tramitar pedido (recogida o envío)
├── gracias.html       · Confirmación de pedido
├── sobre.html         · Sobre Jazmín (historia desde 1992)
├── contacto.html      · Formulario de contacto + datos
├── css/styles.css     · Estilos (paleta verde + crema + terracota)
└── js/
    ├── data.js        · 43 productos + traducciones ES/VAL + datos de la empresa
    └── app.js         · Renderizado, carrito, i18n, header/footer
```

## Idiomas

Botón **ES / VAL** en la cabecera. La selección se guarda en `localStorage`.

- Castellano (`es`)
- Valencià (`va`)

Todas las cadenas de UI están en `js/data.js → I18N`. Los productos
tienen nombre y descripción en ambos idiomas dentro del array `PRODUCTS`.

## Catálogo

43 productos repartidos en 6 categorías:

| Categoría             | Productos |
| ----------------------|-----------|
| Plantas de interior   | 10        |
| Plantas de exterior   | 10        |
| Árboles y arbustos    | 8         |
| Sustratos y abonos    | 5         |
| Macetas y jardinería  | 5         |
| Flores de temporada   | 5         |

Las imágenes son SVG inline generados a partir de la categoría y un
`imgSeed` (tono). Para sustituir por fotos reales basta con añadir un
campo `img: "url"` a cada producto y leerlo en `productImgSVG()`
dentro de `app.js`.

## Carrito y pedido

- Persistencia en `localStorage` (clave `vj.cart`).
- El formulario de checkout permite recogida en tienda o envío a domicilio.
- Al enviar se genera una referencia tipo `JZ-XXXX` y se guarda el
  pedido en `localStorage` (`vj.lastOrder`) — punto perfecto para
  conectar más adelante con un backend o servicio de email.

## Datos de la empresa

Editables en `js/data.js → SITE_INFO`:

```js
address:   Calle Río Anna 135, 12006 Castelló de la Plana
phone:     636 54 35 66
email:     jazminfloristeria@hotmail.com
hours ES:  Lunes a sábado: 8:30–13:30 y 16:00–20:00 · Domingo y festivos: 9:00–13:00
hours VAL: Dilluns a dissabte: 8:30–13:30 i 16:00–20:00 · Diumenge i festius: 9:00–13:00
```

## Paleta y tipografía

- Verde bosque `#4a7c4e`, verde salvia `#6ba076`, crema `#faf7f2`,
  terracota `#c98a5a`, verde oscuro `#2c3e2d`.
- Títulos: **Cormorant Garamond** (serif, elegante).
- Texto: **Lato** (sans, limpia y muy legible).

Ambas fuentes se cargan desde Google Fonts.

## Próximos pasos para producción

1. **Pago real**: integrar Stripe Checkout o PayPal en `renderCheckoutPage()`
   (sustituyendo el bloque `form.addEventListener("submit", …)`).
2. **Envío de pedidos por email**: en producción, enviar el JSON `order`
   a un endpoint (Formspree, Resend, Netlify Forms, etc.).
3. **Gestor de productos**: si el cliente quiere editar productos sin
   tocar código, migrar `PRODUCTS` a una hoja de cálculo, CMS headless
   (Sanity, Strapi) o directamente a Shopify/WooCommerce.
4. **Fotos reales**: sustituir los SVG de placeholder por fotos del vivero.
5. **Dominio y hosting**: cualquier hosting estático sirve
   (Netlify, Vercel, GitHub Pages, OVH, IONOS…).

---

© 1992–2026 Viveros Jazmín
