# 邮件附件处理器

这个模块用于接收邮件，检查邮件是否包含附件，并将附件存储到Cloudflare R2中。该项目使用JavaScript实现。

## 功能特点

- 接收邮件并解析内容
- 检查邮件是否包含附件
- 将附件保存到Cloudflare R2存储桶中
- 使用原始文件名直接存储在根目录下
- 可选：记录统计信息到Analytics Engine

注意：该模块针对Z-Library邮件进行了优化，但也可以处理其他邮件。若名称有问题，请自行修改。

## WebDAV 功能

本项目集成了 WebDAV 服务器功能，允许您通过 WebDAV 客户端直接访问和管理存储在 R2 中的附件。

### 配置 WebDAV

1.  打开 `wrangler.toml` 文件。
2.  在 `[vars]` 部分，设置您的 WebDAV 用户名和密码：
    ```toml
    [vars]
    WEBDAV_USER = "your_username"      # 请设置您的WebDAV用户名
    WEBDAV_PASSWORD = "your_password"  # 请设置您的WebDAV密码
    ```
3.  部署后，您的 WebDAV 访问地址即为 Worker 的 URL (例如 `https://your-worker-name.your-subdomain.workers.dev`)。

### 连接 WebDAV

您可以使用任何支持 WebDAV 协议的客户端进行连接，例如：
- Windows 资源管理器
- macOS Finder
- RaiDrive, Cyberduck 等第三方工具

连接时，请使用您在 `wrangler.toml` 中设置的用户名和密码。

## 使用方法
fork 本项目

1. 确保`wrangler.toml`中已配置R2存储桶：

```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "你的存储桶名称"
```

2. 部署Worker：
部署命令
```bash
npx wrangler publish
```

3. 配置Email路由，将邮件转发到此Worker。

## 配置说明

- 邮件附件将以原始文件名直接存储在R2根目录中
- 如果配置了Analytics Engine，将记录每封邮件的处理情况

## 部署说明

项目可以通过以下方式部署：

1. 本地部署：
   ```bash
   npm run deploy
   ```

2. CI/CD部署：
   确保构建命令使用`npx wrangler publish`而不是`npx wrangler deploy`

## 示例

当收到包含附件的邮件时，附件将直接以原始文件名保存在R2存储桶的根目录中：

```
report.xml
example.pdf
image.jpg
```

## 开发

在本地开发时，可以使用以下命令启动Worker：

```bash
npm run start
```

或直接使用wrangler：

```bash
npx wrangler dev
```
