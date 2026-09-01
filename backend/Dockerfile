# Backend Dockerfile
FROM node:20-alpine
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app
COPY . .

EXPOSE 5000
ENV PORT=5000
CMD ["node","server.js"]
