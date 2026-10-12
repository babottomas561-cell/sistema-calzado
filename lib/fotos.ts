// Las fotos del celular pesan 3-6 MB: se achican en el navegador antes de subirlas a Storage.
// 1600 px de lado alcanza para ver un producto grande; las de la portada (a pantalla completa) van a 2400.
// JPEG al 82 % deja cada foto en ~150-400 KB (carga rápido con datos móviles).
export async function achicarFoto(archivo: File, ladoMaximo = 1600, calidad = 0.82): Promise<Blob> {
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, ladoMaximo / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext("2d")!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo procesar la foto"))), "image/jpeg", calidad));
}
