# SlideCast 容器化构建文件
FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package.json ./
RUN npm install --production

# 复制源码
COPY . .

# 创建必要目录
RUN mkdir -p uploads public

EXPOSE 8080

CMD ["node", "server.js"]
