# Build stage
FROM node:18-alpine as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM nginx:stable-alpine as production-stage
RUN mkdir -p /usr/share/nginx/html/login
COPY --from=build-stage /app/dist /usr/share/nginx/html/login
# Custom nginx config to handle subpath and routing
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
