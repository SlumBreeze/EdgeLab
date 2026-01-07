# Stage 1: Build the Vite app
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build arguments to bake env vars into the static build
ARG GEMINI_API_KEY
ARG ODDS_API_KEY
ARG SUPABASE_URL
ARG SUPABASE_KEY

# Set env vars for the build process
ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV ODDS_API_KEY=$ODDS_API_KEY
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_KEY=$SUPABASE_KEY

RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
