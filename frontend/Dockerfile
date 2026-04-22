FROM node:20-alpine

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_AUTO_LOGIN_ACCOUNTS=false
ARG BACKEND_INTERNAL_URL=http://backend:8000

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_AUTO_LOGIN_ACCOUNTS=${NEXT_PUBLIC_AUTO_LOGIN_ACCOUNTS}
ENV BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL}

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
