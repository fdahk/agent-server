FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev

COPY . .

RUN npm run build

EXPOSE 3101

CMD ["node", "dist/main"]
