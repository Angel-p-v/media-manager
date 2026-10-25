# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder

WORKDIR /app

# Dependencias (incluye dev para compilar better-sqlite3 y TypeScript)
COPY package*.json ./
RUN npm ci

# Código fuente y compilación
COPY . .
RUN npm run build

# Imagen final: solo runtime
FROM node:22-alpine

WORKDIR /app

# Usuario no-root para ejecutar mm
RUN addgroup -S mmgroup && adduser -S mmuser -G mmgroup

# Copiar artefactos compilados y módulos de node
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Cambiar propietario al usuario no-root
RUN chown -R mmuser:mmgroup /app

USER mmuser

ENTRYPOINT ["node", "dist/cli.js"]
