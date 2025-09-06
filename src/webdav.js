import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'

const app = new Hono()

// 添加基础认证中间件
app.use('*', async (c, next) => {
  if (c.env.WEBDAV_USER && c.env.WEBDAV_PASSWORD) {
    const auth = basicAuth({
      username: c.env.WEBDAV_USER,
      password: c.env.WEBDAV_PASSWORD,
    })
    return auth(c, next)
  }
  // 如果没有设置用户名和密码，则不进行认证
  return next()
})

// PROPFIND - 列出文件和目录
app.on('PROPFIND', '/*', async (c) => {
  const { path } = c.req
  const list = await c.env.R2_BUCKET.list({ prefix: path.substring(1) })

  const multistatus = `
    <D:multistatus xmlns:D="DAV:">
      ${list.objects.map(obj => `
        <D:response>
          <D:href>${'/' + obj.key}</D:href>
          <D:propstat>
            <D:prop>
              <D:getlastmodified>${obj.uploaded.toUTCString()}</D:getlastmodified>
              <D:getcontentlength>${obj.size}</D:getcontentlength>
              <D:resourcetype>${obj.key.endsWith('/') ? '<D:collection/>' : ''}</D:resourcetype>
            </D:prop>
            <D:status>HTTP/1.1 200 OK</D:status>
          </D:propstat>
        </D:response>
      `).join('')}
    </D:multistatus>
  `

  return new Response(multistatus, {
    status: 207,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
})

// GET - 获取文件内容
app.get('/*', async (c) => {
  const { path } = c.req
  const object = await c.env.R2_BUCKET.get(path.substring(1))

  if (object === null) {
    return new Response('Object Not Found', { status: 404 })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)

  return new Response(object.body, {
    headers,
  })
})

// PUT - 上传文件
app.put('/*', async (c) => {
  const { path } = c.req
  await c.env.R2_BUCKET.put(path.substring(1), c.req.body)
  return new Response(null, { status: 201 })
})

// DELETE - 删除文件
app.delete('/*', async (c) => {
  const { path } = c.req
  await c.env.R2_BUCKET.delete(path.substring(1))
  return new Response(null, { status: 204 })
})

// MKCOL - 创建目录 (在R2中，目录是隐式的，通过上传带/的对象来创建)
app.on('MKCOL', '/*', async (c) => {
    const { path } = c.req;
    // R2中创建目录通常是创建一个以/结尾的0字节对象
    await c.env.R2_BUCKET.put(path.substring(1) + '/', null);
    return new Response(null, { status: 201 });
});


export default app
