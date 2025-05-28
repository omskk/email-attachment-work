# 邮件附件处理器

这个模块用于接收邮件，检查邮件是否包含附件，并将附件存储到Cloudflare R2中。

## 功能特点

- 接收邮件并解析内容
- 检查邮件是否包含附件
- 将附件保存到Cloudflare R2存储桶中
- 使用原始文件名直接存储在根目录下
- 可选：记录统计信息到Analytics Engine

## 使用方法

1. 确保`wrangler.toml`中已配置R2存储桶：

```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "你的存储桶名称"
```

2. 部署Worker：

```bash
wrangler publish
```

3. 配置Email路由，将邮件转发到此Worker。

## 配置说明

- 邮件附件将以原始文件名直接存储在R2根目录中
- 如果配置了Analytics Engine，将记录每封邮件的处理情况

## 示例

当收到包含附件的邮件时，附件将直接以原始文件名保存：

```
report.xml
```

## 开发

在本地开发时，可以使用以下命令启动Worker：

```bash
wrangler dev
``` 