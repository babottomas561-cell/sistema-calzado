#!/usr/bin/env bash
# Carga la conexión técnica (tokens de Supabase y Vercel) en una instalación. Pide los dos tokens sin mostrarlos y corre
# «npm run instalaciones -- conexion». Uso: bash scripts/conectar-tecnica.sh mi-calzado
set -e
slug="${1:-mi-calzado}"
echo "Conexión técnica de «$slug»."
echo "  Token de Supabase: https://supabase.com/dashboard/account/tokens  (Generate new token)"
echo "  Token de Vercel:   https://vercel.com/account/tokens  (Create Token; alcance: el equipo del local)"
echo
read -r -s -p "Pegá el token de Supabase y tocá Enter (no se ve): " SUPABASE_ACCESS_TOKEN; echo
read -r -s -p "Pegá el token de Vercel y tocá Enter (no se ve): " VERCEL_TOKEN; echo
export SUPABASE_ACCESS_TOKEN VERCEL_TOKEN
npm run instalaciones -- conexion --slug "$slug"
