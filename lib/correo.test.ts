import { test } from "node:test";
import assert from "node:assert/strict";
import { limpiarClaveGmail, modoDe } from "./correo.ts";

test("el modo sale del servidor guardado", () => {
  assert.equal(modoDe("smtp.resend.com"), "dominio");
  assert.equal(modoDe(" SMTP.GMAIL.COM "), "gmail");
  assert.equal(modoDe("smtp-relay.brevo.com"), "otro");
  assert.equal(modoDe(null), "otro");
});

test("la contraseña de aplicación de Google se guarda sin espacios", () => {
  assert.equal(limpiarClaveGmail("abcd efgh ijkl mnop"), "abcdefghijklmnop");
  assert.equal(limpiarClaveGmail(" abcdefghijklmnop "), "abcdefghijklmnop");
});
