// La dirección pública de la tienda (la de producción; en local, la de esta compu): para pegar en Meta y Mercado Pago
export const sitio = () => (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
