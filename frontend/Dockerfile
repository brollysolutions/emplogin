# Build stage
FROM node:20-alpine as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM nginx:stable-alpine as production-stage
RUN mkdir -p /usr/share/nginx/html/login
COPY --from=build-stage /app/dist /usr/share/nginx/html/login
# Use the default nginx config
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
