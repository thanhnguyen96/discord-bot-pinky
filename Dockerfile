FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npx prisma generate

RUN addgroup -g 1001 -S nodejs
RUN adduser -S botuser -u 1001

# Change ownership of the app directory to the botuser
RUN chown -R botuser:nodejs /app
USER botuser

CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]