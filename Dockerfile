# Stage 1: Build
FROM node:20-slim AS build

WORKDIR /app

# Add build arguments for environment variables
ARG VITE_FREESOUND_TOKEN

# Set them as environment variables for the build process
ENV VITE_FREESOUND_TOKEN=$VITE_FREESOUND_TOKEN
ENV GITHUB_PAGES_BASE=/

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
# We ensure the base path is root for VPS deployment
ENV GITHUB_PAGES_BASE=/
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

# Copy built files from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
