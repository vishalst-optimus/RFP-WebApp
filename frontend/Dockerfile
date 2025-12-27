 
# ---------- Build Stage ----------
FROM node:20-bullseye AS build
 
WORKDIR /app
 
COPY package*.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
 
COPY . .
 
# Skip type checking, only build with Vite
RUN npm run vite build || npx vite build
 
# ---------- Production Stage ----------
FROM node:20-bullseye
WORKDIR /app
 
COPY --from=build /app/dist ./dist
RUN npm install -g serve
 
EXPOSE 3000
ENV NODE_ENV=production
CMD ["serve", "-s", "dist", "-l", "3000"]
